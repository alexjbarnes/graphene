import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  appendFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";
import { createHash, randomBytes } from "node:crypto";

export interface StoredEdge {
  to: string;
  type: string;
  reason: string | null;
}

export interface StoredObservation {
  id: string;
  content: string;
  source: string | null;
}

export interface StoredNode {
  name: string;
  type: string;
  summary: string | null;
  entry_points: string[];
  covers: string[];
  last_commit: string | null;
  metadata: Record<string, unknown>;
  edges: StoredEdge[];
  observations: StoredObservation[];
}

export interface StoredFact {
  category: string;
  subject: string;
  content: string;
}

const SLUG_RE = /^[a-z0-9_][a-z0-9._-]*$/;

// "__" is additionally banned because it is the category/subject separator in
// fact filenames: allowing it would let ("a__b", "c") and ("a", "b__c") both
// name the file a__b__c.md.
export function isValidSlug(s: string): boolean {
  return SLUG_RE.test(s) && !s.includes("__");
}

export function validateSlug(s: string, label: string): void {
  if (!isValidSlug(s)) {
    throw new Error(
      `${label} must be lowercase and contain only letters, digits, "_", ".", or "-" ` +
        `(no leading "." or "-", no "__"); got "${s}"`
    );
  }
}

export function observationId(content: string, existingIds: Set<string>): string {
  const base = createHash("sha256").update(content).digest("hex").slice(0, 4);
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// --- frontmatter line helpers, shared between node and fact files ---

function splitKeyValue(line: string): { key: string; value: string } {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(`Malformed frontmatter line: "${line}"`);
  }
  const key = line.slice(0, colonIdx);
  const after = line.slice(colonIdx + 1);
  const value = after.startsWith(" ") ? after.slice(1) : after;
  return { key, value };
}

// Reads consecutive `  - item` lines (exactly two-space indent) starting at
// `start`, stripping only the two-space indent. Stops at the first line that
// is not indented (next key, blank separator, or end of frontmatter).
function readListBlock(lines: string[], start: number): { items: string[]; next: number } {
  const items: string[] = [];
  let i = start;
  while (i < lines.length && lines[i].startsWith("  ")) {
    items.push(lines[i].slice(2));
    i++;
  }
  return { items, next: i };
}

function parsePlainListItem(item: string, name: string): string {
  if (!item.startsWith("- ")) {
    throw new Error(`Malformed list item in node "${name}": "${item}"`);
  }
  return item.slice(2);
}

const EDGE_RE = /^- to: (\S+) type: (\S+)(?: reason: (.*))?$/;

function parseEdgeLine(line: string, name: string): StoredEdge {
  const match = EDGE_RE.exec(line);
  if (!match) {
    throw new Error(`Malformed edge line in node "${name}": "${line}"`);
  }
  return { to: match[1], type: match[2], reason: match[3] ?? null };
}

function pushList(lines: string[], key: string, items: string[]): void {
  if (items.length === 0) return;
  lines.push(`${key}:`);
  for (const item of items) lines.push(`  - ${item}`);
}

// --- node frontmatter ---

interface ParsedNodeFrontmatter {
  type: string;
  summary: string | null;
  entry_points: string[];
  covers: string[];
  last_commit: string | null;
  metadata: Record<string, unknown>;
  edges: StoredEdge[];
}

function parseNodeFrontmatter(fmLines: string[], name: string): ParsedNodeFrontmatter {
  let type: string | undefined;
  let summary: string | null = null;
  let entryPoints: string[] = [];
  let covers: string[] = [];
  let lastCommit: string | null = null;
  let metadata: Record<string, unknown> = {};
  let edges: StoredEdge[] = [];

  let i = 0;
  while (i < fmLines.length) {
    const { key, value } = splitKeyValue(fmLines[i]);

    switch (key) {
      case "type":
        type = value;
        i++;
        break;
      case "summary":
        summary = value;
        i++;
        break;
      case "last_commit":
        lastCommit = value;
        i++;
        break;
      case "metadata":
        metadata = JSON.parse(value) as Record<string, unknown>;
        i++;
        break;
      case "entry_points": {
        const { items, next } = readListBlock(fmLines, i + 1);
        entryPoints = items.map((item) => parsePlainListItem(item, name));
        i = next;
        break;
      }
      case "covers": {
        const { items, next } = readListBlock(fmLines, i + 1);
        covers = items.map((item) => parsePlainListItem(item, name));
        i = next;
        break;
      }
      case "edges": {
        const { items, next } = readListBlock(fmLines, i + 1);
        edges = items.map((item) => parseEdgeLine(item, name));
        i = next;
        break;
      }
      default:
        throw new Error(`Unknown frontmatter key "${key}" in node "${name}"`);
    }
  }

  if (type === undefined) {
    throw new Error(`Node "${name}" is missing required frontmatter key "type"`);
  }

  return {
    type,
    summary,
    entry_points: entryPoints,
    covers,
    last_commit: lastCommit,
    metadata,
    edges,
  };
}

function serializeNodeFrontmatter(node: StoredNode): string {
  const lines: string[] = [];
  lines.push(`type: ${node.type}`);
  if (node.summary !== null) {
    lines.push(`summary: ${node.summary.replace(/\n/g, " ")}`);
  }
  pushList(lines, "entry_points", node.entry_points);
  pushList(lines, "covers", node.covers);
  if (node.last_commit !== null) {
    lines.push(`last_commit: ${node.last_commit}`);
  }
  if (Object.keys(node.metadata).length > 0) {
    lines.push(`metadata: ${JSON.stringify(node.metadata)}`);
  }
  if (node.edges.length > 0) {
    lines.push("edges:");
    for (const edge of node.edges) {
      const reason = edge.reason !== null ? ` reason: ${edge.reason}` : "";
      lines.push(`  - to: ${edge.to} type: ${edge.type}${reason}`);
    }
  }
  return lines.join("\n");
}

// --- node body (observations) ---

// Matches only a marker anchored at the end of the (possibly multi-line)
// observation text, so `<!--` occurring mid-content is left untouched.
const MARKER_RE = / <!-- id:(\S+)(?: src:(.*))? -->$/;

function splitMarker(raw: string): { content: string; id: string; source: string | null } {
  const match = MARKER_RE.exec(raw);
  if (!match) {
    throw new Error(`Observation is missing its id marker: "${raw}"`);
  }
  return { content: raw.slice(0, match.index), id: match[1], source: match[2] ?? null };
}

function parseBody(text: string): StoredObservation[] {
  const observations: StoredObservation[] = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === "") {
      i++;
      continue;
    }
    if (!lines[i].startsWith("- ")) {
      throw new Error(`Malformed observation line: "${lines[i]}"`);
    }
    const contentLines = [lines[i].slice(2)];
    i++;
    while (i < lines.length && lines[i].startsWith("  ")) {
      contentLines.push(lines[i].slice(2));
      i++;
    }
    const { content, id, source } = splitMarker(contentLines.join("\n"));
    observations.push({ id, content, source });
  }
  return observations;
}

function serializeObservation(obs: StoredObservation): string {
  const marker = obs.source !== null ? ` <!-- id:${obs.id} src:${obs.source} -->` : ` <!-- id:${obs.id} -->`;
  const lines = obs.content.split("\n").map((line, i) => (i === 0 ? `- ${line}` : `  ${line}`));
  lines[lines.length - 1] += marker;
  return lines.join("\n");
}

function serializeBody(observations: StoredObservation[]): string {
  return observations.map(serializeObservation).join("\n") + "\n";
}

// --- node file ---

export function parseNodeFile(text: string, name: string): StoredNode {
  const lines = text.split("\n");
  if (lines[0] !== "---") {
    throw new Error(`Node file "${name}" must start with a "---" frontmatter delimiter`);
  }
  let i = 1;
  const fmLines: string[] = [];
  while (i < lines.length && lines[i] !== "---") {
    fmLines.push(lines[i]);
    i++;
  }
  if (i >= lines.length) {
    throw new Error(`Node file "${name}" is missing its closing "---" delimiter`);
  }
  i++;
  const bodyText = lines.slice(i).join("\n");

  const fm = parseNodeFrontmatter(fmLines, name);
  const observations = parseBody(bodyText);
  return { name, ...fm, observations };
}

export function serializeNodeFile(node: StoredNode): string {
  const header = `---\n${serializeNodeFrontmatter(node)}\n---\n`;
  if (node.observations.length === 0) return header;
  return `${header}\n${serializeBody(node.observations)}`;
}

// --- fact file ---

export function parseFactFile(text: string): StoredFact {
  const lines = text.split("\n");
  if (lines[0] !== "---") {
    throw new Error(`Fact file must start with a "---" frontmatter delimiter`);
  }
  let i = 1;
  const fmLines: string[] = [];
  while (i < lines.length && lines[i] !== "---") {
    fmLines.push(lines[i]);
    i++;
  }
  if (i >= lines.length) {
    throw new Error(`Fact file is missing its closing "---" delimiter`);
  }
  i++;
  const bodyText = lines.slice(i).join("\n");

  let category: string | undefined;
  let subject: string | undefined;
  for (const line of fmLines) {
    const { key, value } = splitKeyValue(line);
    if (key === "category") category = value;
    else if (key === "subject") subject = value;
    else throw new Error(`Unknown frontmatter key "${key}" in fact file`);
  }
  if (category === undefined) {
    throw new Error(`Fact file is missing required frontmatter key "category"`);
  }
  if (subject === undefined) {
    throw new Error(`Fact file is missing required frontmatter key "subject"`);
  }

  return { category, subject, content: bodyText.trim() };
}

export function serializeFactFile(fact: StoredFact): string {
  return `---\ncategory: ${fact.category}\nsubject: ${fact.subject}\n---\n\n${fact.content}\n`;
}

// --- paths ---

export function grapheneDir(repoRoot: string): string {
  return join(repoRoot, ".graphene");
}

export function nodesDir(repoRoot: string): string {
  return join(grapheneDir(repoRoot), "nodes");
}

export function factsDir(repoRoot: string): string {
  return join(grapheneDir(repoRoot), "facts");
}

// Path constructors are the validation chokepoint: every read, write, and
// delete goes through them, so an invalid or traversal-shaped name can never
// touch the filesystem.
export function nodePath(repoRoot: string, name: string): string {
  validateSlug(name, "node name");
  return join(nodesDir(repoRoot), `${name}.md`);
}

function factFileName(category: string, subject: string): string {
  validateSlug(category, "category");
  validateSlug(subject, "subject");
  return `${category}__${subject}.md`;
}

export function factPath(repoRoot: string, category: string, subject: string): string {
  return join(factsDir(repoRoot), factFileName(category, subject));
}

export function globalDir(): string {
  return join(homedir(), ".graphene", "global");
}

export function globalFactPath(category: string, subject: string): string {
  return join(globalDir(), factFileName(category, subject));
}

// --- atomic file IO ---

export function writeFileAtomic(path: string, content: string): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tempPath = join(dir, `.${basename(path)}.${randomBytes(8).toString("hex")}.tmp`);
  writeFileSync(tempPath, content);
  renameSync(tempPath, path);
}

// appendFileSync opens the file by path, writes, and closes on every call. If
// a concurrent writeFileAtomic() renames a new file over `path` after our
// write lands but the caller-supplied marker still can't be found, we may
// have written to the inode that was just unlinked by that rename (an
// O_APPEND write is only guaranteed to land on whatever inode `path`
// resolves to at open() time). Re-reading and, if needed, redoing the write
// as a full atomic rewrite recovers from that race without losing data.
export function appendLineVerified(path: string, line: string, marker: string): void {
  appendFileSync(path, line, { flag: "a" });
  const verify = readFileSync(path, "utf-8");
  if (verify.includes(marker)) return;
  const current = readFileSync(path, "utf-8");
  writeFileAtomic(path, current + line);
}

// --- node CRUD ---

export function listNodes(repoRoot: string): string[] {
  const dir = nodesDir(repoRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .sort();
}

export function readNode(repoRoot: string, name: string): StoredNode | null {
  const path = nodePath(repoRoot, name);
  if (!existsSync(path)) return null;
  return parseNodeFile(readFileSync(path, "utf-8"), name);
}

export function writeNode(repoRoot: string, node: StoredNode): void {
  writeFileAtomic(nodePath(repoRoot, node.name), serializeNodeFile(node));
}

export function deleteNodeFile(repoRoot: string, name: string): boolean {
  const path = nodePath(repoRoot, name);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

// --- fact CRUD (dir is factsDir(repoRoot) or globalDir(), so repo and
// global stores share the same read/write/delete code) ---

export function listFacts(dir: string): StoredFact[] {
  if (!existsSync(dir)) return [];
  const facts = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseFactFile(readFileSync(join(dir, f), "utf-8")));
  facts.sort((a, b) => {
    if (a.category !== b.category) return a.category < b.category ? -1 : 1;
    if (a.subject !== b.subject) return a.subject < b.subject ? -1 : 1;
    return 0;
  });
  return facts;
}

export function readFact(dir: string, category: string, subject: string): StoredFact | null {
  const path = join(dir, factFileName(category, subject));
  if (!existsSync(path)) return null;
  return parseFactFile(readFileSync(path, "utf-8"));
}

export function writeFact(dir: string, fact: StoredFact): void {
  const path = join(dir, factFileName(fact.category, fact.subject));
  writeFileAtomic(path, serializeFactFile(fact));
}

export function deleteFactFile(dir: string, category: string, subject: string): boolean {
  const path = join(dir, factFileName(category, subject));
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
