import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { readNode, writeNode, observationId } from "../src/store.js";

export interface TestRepo {
  path: string;
  cleanup: () => void;
  commit: (message: string) => string;
  writeFile: (name: string, content: string) => void;
}

// With no args, creates a repo at a fresh random temp path (as before). Pass
// parentDir+name to place the repo at a chosen path instead, e.g. to build a
// parent directory containing several child repos for multi-repo tests.
export function createTestGitRepo(parentDir?: string, name?: string): TestRepo {
  const path = parentDir ? join(parentDir, name ?? "repo") : mkdtempSync(join(tmpdir(), "graphene-test-"));
  if (parentDir) mkdirSync(path, { recursive: true });
  execSync("git init", { cwd: path, stdio: "ignore" });
  execSync("git config user.email test@test.com", { cwd: path, stdio: "ignore" });
  execSync("git config user.name Test", { cwd: path, stdio: "ignore" });
  execSync("git commit --allow-empty -m init", { cwd: path, stdio: "ignore" });

  return {
    path,
    cleanup: () => rmSync(path, { recursive: true, force: true }),
    commit(message: string): string {
      execSync(`git add -A && git commit -m "${message}"`, {
        cwd: path,
        stdio: "ignore",
      });
      return execSync("git rev-parse HEAD", {
        cwd: path,
        encoding: "utf-8",
      }).trim();
    },
    writeFile(name: string, content: string): void {
      mkdirSync(join(path, dirname(name)), { recursive: true });
      writeFileSync(join(path, name), content);
    },
  };
}

export interface TestRepoDir {
  repoRoot: string;
  cleanup: () => void;
}

// A plain directory to use as a graphene repoRoot. Storage tools only ever
// touch `${repoRoot}/.graphene/...` and never require the directory to be a
// git repo; use createTestGitRepo() instead when the test needs real git
// history (stale, status, e2e).
export function createTestRepo(): TestRepoDir {
  const repoRoot = mkdtempSync(join(tmpdir(), "graphene-repo-test-"));
  return {
    repoRoot,
    cleanup: () => rmSync(repoRoot, { recursive: true, force: true }),
  };
}

export interface TestGlobalDir {
  dir: string;
  cleanup: () => void;
}

export function createTestGlobalDir(): TestGlobalDir {
  const dir = mkdtempSync(join(tmpdir(), "graphene-global-test-"));
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// Writes observations straight into a node file, past learn()'s size limits:
// the shape of a node that grew before those limits existed, or was edited by
// hand. Returns the new observations' ids, in order.
export function seedObservations(
  repoRoot: string,
  name: string,
  observations: Array<{ content: string; source?: string }>
): string[] {
  const node = readNode(repoRoot, name);
  if (!node) throw new Error(`seedObservations: no node ${name}`);
  const ids = new Set(node.observations.map((o) => o.id));
  const added = observations.map(({ content, source }) => {
    const id = observationId(content, ids);
    ids.add(id);
    return { id, content, source: source ?? null };
  });
  writeNode(repoRoot, { ...node, observations: [...node.observations, ...added] });
  return added.map((o) => o.id);
}
