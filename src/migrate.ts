import { existsSync, readFileSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  type StoredNode,
  type StoredEdge,
  type StoredObservation,
  type StoredFact,
  writeNode,
  writeFact,
  factsDir,
  grapheneDir,
  observationId,
  isValidSlug,
  writeFileAtomic,
} from "./store.js";

// --- lazy node:sqlite loading ---
//
// node:sqlite needs Node >= 22.5 and prints an ExperimentalWarning on first
// use, so it must only be required once a legacy db is confirmed to exist
// (see the existsSync guards in migrateRepo/migrateGlobal below, and the
// equivalent guards in index.ts before it calls either of them). createRequire
// gives a synchronous load, matching the plain (non-Promise) return types
// below -- a dynamic `import()` would force both functions to become async.
function loadSqlite(): typeof import("node:sqlite") {
  const req = createRequire(import.meta.url);
  return req("node:sqlite") as typeof import("node:sqlite");
}

export function isSqliteAvailable(): boolean {
  try {
    loadSqlite();
    return true;
  } catch {
    return false;
  }
}

export function legacyRepoDbPath(repoRoot: string): string {
  return join(grapheneDir(repoRoot), "context.db");
}

export function legacyGlobalDbPath(): string {
  return join(homedir(), ".graphene", "global.db");
}

// --- legacy row shapes (retired sql.js-era schema) ---

interface LegacyNodeRow {
  name: string;
  type: string;
  summary: string | null;
  entry_points: string | null;
  covers: string | null;
  last_commit: string | null;
  metadata: string | null;
}

interface LegacyEdgeRow {
  from_node: string;
  to_node: string;
  type: string;
  reason: string | null;
}

interface LegacyObservationRow {
  id: number;
  node_name: string;
  content: string;
  source: string | null;
  created_at: string;
}

interface LegacyFactRow {
  id: number;
  category: string;
  subject: string;
  content: string;
}

// --- legacy name normalization ---
//
// Legacy node names, fact categories, and fact subjects were arbitrary
// strings; validateSlug (store.ts) rejects uppercase, spaces, ":", "/", "__",
// and a leading "." or "-". This lowercases, folds every run of characters
// outside [a-z0-9_.-] to a single "-", collapses repeated "-", folds inner
// "__" runs (each underscore alone is a valid slug character, so the
// character-class fold above never touches them) to "-", and finally strips
// any leading "." or "-" that would still violate validateSlug's
// first-character rule -- "." is a legal slug character everywhere except
// position 0, so it survives the character-class fold untouched and needs
// its own pass. An empty result (e.g. the input was punctuation only) falls
// back to "node".
function normalizeLegacyName(raw: string): string {
  let s = raw.toLowerCase();
  s = s.replace(/[^a-z0-9_.-]+/g, "-");
  s = s.replace(/-{2,}/g, "-");
  s = s.replace(/_{2,}/g, "-");
  s = s.replace(/^[.-]+/, "").replace(/-+$/, "");
  return s === "" ? "node" : s;
}

// Appends -2, -3, ... until `candidate` no longer collides with `taken`,
// mirroring observationId's own collision-suffix scheme.
function dedupe(candidate: string, taken: ReadonlySet<string>): string {
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  while (taken.has(`${candidate}-${n}`)) n++;
  return `${candidate}-${n}`;
}

// --- node migration ---

interface NodeRenames {
  finalNameOf: Map<string, string>;
  renamedRaw: Set<string>;
  renamed: string[];
  taken: Set<string>;
}

// Already-valid names are reserved first, untouched (they are guaranteed
// unique by the legacy table's PRIMARY KEY, so this pass alone can never
// collide). Only names that fail isValidSlug are normalized and, if the
// normalized form collides with an already-reserved name, de-collided with a
// numeric suffix -- so a pre-existing valid name is never perturbed by an
// unrelated invalid one that happens to normalize onto it.
function buildNodeRenames(rows: LegacyNodeRow[]): NodeRenames {
  const taken = new Set<string>();
  const finalNameOf = new Map<string, string>();
  const renamedRaw = new Set<string>();
  const renamed: string[] = [];

  for (const row of rows) {
    if (isValidSlug(row.name)) {
      taken.add(row.name);
      finalNameOf.set(row.name, row.name);
    }
  }

  for (const row of rows) {
    if (isValidSlug(row.name)) continue;
    const final = dedupe(normalizeLegacyName(row.name), taken);
    taken.add(final);
    finalNameOf.set(row.name, final);
    renamedRaw.add(row.name);
    renamed.push(`${row.name} -> ${final}`);
  }

  return { finalNameOf, renamedRaw, renamed, taken };
}

// Resolves an edge endpoint or an observation's owning node_name to its
// final name. The legacy schema's `REFERENCES nodes(name) ON DELETE CASCADE`
// FK should make an unresolvable reference unreachable in a healthy db, but
// a hand-edited or corrupted legacy file could still contain one;
// normalizing and reserving it defensively keeps the emitted markdown
// well-formed (an untouched raw name containing whitespace would corrupt the
// `- to: <name> type: <type>` edge grammar) instead of failing the whole
// migration over an orphaned reference.
function resolveNodeName(raw: string, renames: NodeRenames): string {
  const known = renames.finalNameOf.get(raw);
  if (known !== undefined) return known;
  const final = dedupe(isValidSlug(raw) ? raw : normalizeLegacyName(raw), renames.taken);
  renames.taken.add(final);
  renames.finalNameOf.set(raw, final);
  return final;
}

function migrateNodes(db: DatabaseSync): { nodes: StoredNode[]; renamed: string[] } {
  const nodeRows = db
    .prepare(
      "SELECT name, type, summary, entry_points, covers, last_commit, metadata FROM nodes ORDER BY name ASC"
    )
    .all() as unknown as LegacyNodeRow[];
  const edgeRows = db
    .prepare("SELECT from_node, to_node, type, reason FROM edges ORDER BY rowid ASC")
    .all() as unknown as LegacyEdgeRow[];
  const obsRows = db
    .prepare(
      "SELECT id, node_name, content, source, created_at FROM observations ORDER BY created_at ASC, id ASC"
    )
    .all() as unknown as LegacyObservationRow[];

  const renames = buildNodeRenames(nodeRows);

  const edgesByNode = new Map<string, StoredEdge[]>();
  for (const e of edgeRows) {
    const from = resolveNodeName(e.from_node, renames);
    const to = resolveNodeName(e.to_node, renames);
    const list = edgesByNode.get(from) ?? [];
    list.push({ to, type: e.type, reason: e.reason });
    edgesByNode.set(from, list);
  }

  // obsRows is already globally ordered by created_at ASC, id ASC; grouping
  // by node_name via push() preserves that relative order within each
  // node's own bucket.
  const obsByNode = new Map<string, LegacyObservationRow[]>();
  for (const o of obsRows) {
    const finalName = renames.finalNameOf.get(o.node_name);
    if (finalName === undefined) continue; // orphaned observation: no node to attach it to
    const list = obsByNode.get(finalName) ?? [];
    list.push(o);
    obsByNode.set(finalName, list);
  }

  const nodes: StoredNode[] = nodeRows.map((row) => {
    const finalName = renames.finalNameOf.get(row.name)!;
    const existingIds = new Set<string>();

    const observations: StoredObservation[] = (obsByNode.get(finalName) ?? []).map((o) => {
      const id = observationId(o.content, existingIds);
      existingIds.add(id);
      return { id, content: o.content, source: o.source };
    });

    if (renames.renamedRaw.has(row.name)) {
      const content = `Renamed from "${row.name}" during the v0.11 file migration.`;
      const id = observationId(content, existingIds);
      existingIds.add(id);
      observations.push({ id, content, source: "migration" });
    }

    return {
      name: finalName,
      type: row.type,
      summary: row.summary,
      entry_points: JSON.parse(row.entry_points ?? "[]") as string[],
      covers: JSON.parse(row.covers ?? "[]") as string[],
      last_commit: row.last_commit,
      metadata: JSON.parse(row.metadata ?? "{}") as Record<string, unknown>,
      edges: edgesByNode.get(finalName) ?? [],
      observations,
    };
  });

  return { nodes, renamed: renames.renamed };
}

// --- fact migration (shared by project_facts and global facts) ---

// Category and subject are normalized independently (many facts sharing one
// category is normal and must never be treated as a collision), but
// de-collision operates on the (category, subject) pair -- the file's actual
// identity (category__subject.md) -- since that pair is the only thing that
// can genuinely collide. A colliding pair is de-collided by suffixing the
// subject: category is a deliberately-reused label, so it is never the part
// a migration renumbers.
function migrateFacts(rows: LegacyFactRow[]): { facts: StoredFact[]; renamed: string[] } {
  const takenPairs = new Set<string>();
  const facts: StoredFact[] = [];
  const renamed: string[] = [];

  for (const row of rows) {
    if (isValidSlug(row.category) && isValidSlug(row.subject)) {
      takenPairs.add(`${row.category}__${row.subject}`);
      facts.push({ category: row.category, subject: row.subject, content: row.content });
    }
  }

  for (const row of rows) {
    if (isValidSlug(row.category) && isValidSlug(row.subject)) continue;

    const category = isValidSlug(row.category) ? row.category : normalizeLegacyName(row.category);
    const baseSubject = isValidSlug(row.subject) ? row.subject : normalizeLegacyName(row.subject);
    let subject = baseSubject;
    if (takenPairs.has(`${category}__${subject}`)) {
      let n = 2;
      while (takenPairs.has(`${category}__${baseSubject}-${n}`)) n++;
      subject = `${baseSubject}-${n}`;
    }
    takenPairs.add(`${category}__${subject}`);
    facts.push({ category, subject, content: row.content });
    renamed.push(`${row.category}/${row.subject} -> ${category}/${subject}`);
  }

  return { facts, renamed };
}

// --- gitignore rewrite ---

// The legacy `init` ignored the whole graph directory (`.graphene/` or bare
// `.graphene`). If that line survives migration, a migrated repo would
// silently never commit its new markdown graph, defeating the redesign;
// rewriting it to `.graphene/*.migrated` keeps the retired binary out while
// letting the graph in. Only ever touches a line that is an exact match
// (after trimming trailing whitespace), never appends anything, and never
// writes the file at all when nothing matched.
function rewriteGitignore(repoRoot: string): void {
  const path = join(repoRoot, ".gitignore");
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf-8").split("\n");
  let changed = false;
  const rewritten = lines.map((line) => {
    const trimmed = line.replace(/\s+$/, "");
    if (trimmed !== ".graphene/" && trimmed !== ".graphene") return line;
    changed = true;
    return ".graphene/*.migrated";
  });

  if (changed) writeFileAtomic(path, rewritten.join("\n"));
}

// --- public API ---

export interface MigrateRepoResult {
  migrated: boolean;
  nodes: number;
  facts: number;
  renamed: string[];
}

export function migrateRepo(repoRoot: string): MigrateRepoResult {
  const dbPath = legacyRepoDbPath(repoRoot);
  if (!existsSync(dbPath)) {
    return { migrated: false, nodes: 0, facts: 0, renamed: [] };
  }

  const { DatabaseSync } = loadSqlite();
  const db = new DatabaseSync(dbPath, { readOnly: true });

  let nodes: StoredNode[];
  let facts: StoredFact[];
  let renamed: string[];
  try {
    const nodeResult = migrateNodes(db);
    const factRows = db
      .prepare("SELECT id, category, subject, content FROM project_facts ORDER BY id ASC")
      .all() as unknown as LegacyFactRow[];
    const factResult = migrateFacts(factRows);

    nodes = nodeResult.nodes;
    facts = factResult.facts;
    renamed = [...nodeResult.renamed, ...factResult.renamed];
  } finally {
    db.close();
  }

  // Nothing below runs if any write throws: context.db is never renamed and
  // .gitignore is never rewritten unless every node and fact landed on disk.
  for (const node of nodes) writeNode(repoRoot, node);
  for (const fact of facts) writeFact(factsDir(repoRoot), fact);

  renameSync(dbPath, `${dbPath}.migrated`);
  rewriteGitignore(repoRoot);

  return { migrated: true, nodes: nodes.length, facts: facts.length, renamed };
}

export interface MigrateGlobalResult {
  migrated: boolean;
  facts: number;
  renamed: string[];
}

export function migrateGlobal(globalDirPath: string): MigrateGlobalResult {
  const dbPath = legacyGlobalDbPath();
  if (!existsSync(dbPath)) {
    return { migrated: false, facts: 0, renamed: [] };
  }

  const { DatabaseSync } = loadSqlite();
  const db = new DatabaseSync(dbPath, { readOnly: true });

  let facts: StoredFact[];
  let renamed: string[];
  try {
    const rows = db
      .prepare("SELECT id, category, subject, content FROM facts ORDER BY id ASC")
      .all() as unknown as LegacyFactRow[];
    const result = migrateFacts(rows);
    facts = result.facts;
    renamed = result.renamed;
  } finally {
    db.close();
  }

  for (const fact of facts) writeFact(globalDirPath, fact);

  renameSync(dbPath, `${dbPath}.migrated`);

  return { migrated: true, facts: facts.length, renamed };
}
