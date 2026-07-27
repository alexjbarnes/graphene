import { existsSync, readdirSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { getRepoRoot } from "./git.js";
import { readNode } from "./store.js";

export interface RepoScope {
  name: string;
  root: string;
}

// Directories that are never descended into while discovering child repos,
// beyond any directory whose name starts with ".".
const SKIP_DIRS = new Set(["node_modules", "vendor", "dist", "build", "target", ".cache", "tmp"]);

// Repos may be found at cwd/child (1) or cwd/child/grandchild (2), never deeper.
const MAX_DEPTH = 2;
const MAX_SCOPES = 20;

function isRepoDir(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

// `depth` is the distance (in directories) from `cwd` to the entries this
// call examines: the top-level call examines cwd's direct children at
// depth 1. A discovered repo is never descended into (its own nested .git
// directories, submodules, etc. are irrelevant to scope discovery).
function scanForRepos(dir: string, depth: number, cwd: string, out: RepoScope[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const childPath = join(dir, entry.name);
    if (isRepoDir(childPath)) {
      out.push({ name: relative(cwd, childPath), root: childPath });
      continue;
    }
    if (depth < MAX_DEPTH) {
      scanForRepos(childPath, depth + 1, cwd, out);
    }
  }
}

// Determines the set of repo scopes visible to this session. If `cwd` is
// itself inside a git repo, that single repo is the only scope (matches
// today's single-repo behavior exactly). Otherwise, child repos are
// discovered beneath `cwd` and every one of them is in scope.
export function discoverScopes(cwd: string): RepoScope[] {
  let repoRoot: string | null;
  try {
    repoRoot = getRepoRoot(cwd);
  } catch {
    repoRoot = null;
  }

  if (repoRoot) {
    return [{ name: basename(repoRoot), root: repoRoot }];
  }

  const found: RepoScope[] = [];
  scanForRepos(cwd, 1, cwd, found);
  found.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  if (found.length > MAX_SCOPES) {
    throw new Error(
      `Found ${found.length} repos under ${cwd}, more than the cap of ${MAX_SCOPES}. ` +
        `This parent directory is too broad; run graphene from inside a specific repo instead.`
    );
  }

  return found;
}

function scopeNames(scopes: RepoScope[]): string {
  return scopes.map((s) => s.name).join(", ");
}

// Splits on the LAST colon so a repo name that itself contained a colon
// (not expected in practice, since scope names come from directory names)
// still leaves the node name intact.
function splitRef(ref: string): { repo: string; name: string } | null {
  const idx = ref.lastIndexOf(":");
  if (idx === -1) return null;
  return { repo: ref.slice(0, idx), name: ref.slice(idx + 1) };
}

export type ParsedNodeRef = { scope: RepoScope; name: string } | { name: string };

// Syntactic resolution only: splits a `repo:name` ref and looks up the repo
// part against known scopes. A bare ref (no colon) is returned unresolved
// as `{ name }` for the caller to resolve further (resolveNodeRef) or to
// treat as "not yet placed" (resolveUpsertRef).
export function parseNodeRef(ref: string, scopes: RepoScope[]): ParsedNodeRef {
  const split = splitRef(ref);
  if (!split) return { name: ref };

  const scope = scopes.find((s) => s.name === split.repo);
  if (!scope) {
    throw new Error(`Unknown repo "${split.repo}". In scope: ${scopeNames(scopes)}.`);
  }
  return { scope, name: split.name };
}

// Full read-oriented resolution: a qualified ref resolves directly; a bare
// ref resolves to whichever scope actually has that node, erroring if the
// name is ambiguous (exists in more than one scope) or missing everywhere.
export function resolveNodeRef(ref: string, scopes: RepoScope[]): { scope: RepoScope; name: string } {
  const parsed = parseNodeRef(ref, scopes);
  if ("scope" in parsed) return parsed;

  const name = parsed.name;
  if (scopes.length === 1) {
    return { scope: scopes[0], name };
  }

  const hits = scopes.filter((s) => readNode(s.root, name) !== null);
  if (hits.length === 1) return { scope: hits[0], name };
  if (hits.length > 1) {
    throw new Error(
      `Ambiguous node "${name}": found in ${hits.map((s) => `${s.name}:${name}`).join(", ")}. ` +
        `Qualify with repo:name.`
    );
  }
  throw new Error(`Node not found: ${name} (searched ${scopes.length} repos: ${scopeNames(scopes)})`);
}

// Upsert-oriented resolution: like resolveNodeRef, but a bare name that
// exists nowhere is not an error -- it just means the caller must resolve a
// new home for it (resolveWriteTarget) rather than update an existing file.
// A qualified ref always routes directly to that scope regardless of
// whether the node already exists there or not.
export function resolveUpsertRef(ref: string, scopes: RepoScope[]): ParsedNodeRef {
  const parsed = parseNodeRef(ref, scopes);
  if ("scope" in parsed) return parsed;

  const name = parsed.name;
  if (scopes.length === 1) {
    return { scope: scopes[0], name };
  }

  const hits = scopes.filter((s) => readNode(s.root, name) !== null);
  if (hits.length === 1) return { scope: hits[0], name };
  if (hits.length > 1) {
    throw new Error(
      `Ambiguous node "${name}": found in ${hits.map((s) => `${s.name}:${name}`).join(", ")}. ` +
        `Qualify with repo:name.`
    );
  }
  return { name };
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// Determines which scope owns a brand-new node, for names that were not
// already qualified and do not exist in any scope yet. Each path is tested
// two ways: as a cwd-relative path (does `<cwd>/<path>` fall inside a
// scope's root?) and as an already repo-relative path (does `<root>/<path>`
// exist on disk in exactly one scope?). Every path that resolves decisively
// casts one vote; the result must be a single, unanimous scope.
export function resolveWriteTarget(
  scopes: RepoScope[],
  name: string,
  cwd: string,
  coverPaths: string[]
): RepoScope {
  const parsed = parseNodeRef(name, scopes);
  if ("scope" in parsed) return parsed.scope;
  if (scopes.length === 1) return scopes[0];

  const votes = new Set<RepoScope>();
  for (const p of coverPaths) {
    const cwdRelCandidate = resolve(cwd, p);
    const byCwd = scopes.filter((s) => isInside(s.root, cwdRelCandidate));
    if (byCwd.length === 1) {
      votes.add(byCwd[0]);
      continue;
    }
    if (byCwd.length > 1) continue; // structurally shouldn't happen: scope roots never nest

    const byDisk = scopes.filter((s) => existsSync(join(s.root, p)));
    if (byDisk.length === 1) votes.add(byDisk[0]);
  }

  if (votes.size === 1) return [...votes][0];

  throw new Error(
    `Cannot determine the owning repo for new node "${name}". In scope: ${scopeNames(scopes)}. ` +
      `Qualify the name (repo:name) or give covers/entry_points paths inside one repo.`
  );
}

// Rewrites cwd-relative paths (e.g. "portal/src/x.ts") to be relative to
// the given scope's own root ("src/x.ts") so the stored node file is
// correct for anyone opening that repo directly. Paths that are already
// repo-relative, or that do not resolve inside this scope from cwd, pass
// through unchanged.
export function rewriteRepoRelative(scope: RepoScope, cwd: string, paths: string[]): string[] {
  return paths.map((p) => {
    const cwdRelCandidate = resolve(cwd, p);
    if (isInside(scope.root, cwdRelCandidate)) {
      return relative(scope.root, cwdRelCandidate);
    }
    return p;
  });
}
