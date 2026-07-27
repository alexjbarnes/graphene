import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

export interface TestRepo {
  path: string;
  cleanup: () => void;
  commit: (message: string) => string;
  writeFile: (name: string, content: string) => void;
}

export function createTestGitRepo(): TestRepo {
  const path = mkdtempSync(join(tmpdir(), "graphene-test-"));
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
