import { execFileSync } from "node:child_process";

export function getRepoRoot(cwd?: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error("Not in a git repository");
  }
}

export function getRemoteUrl(repoRoot: string): string | null {
  try {
    const url = execFileSync(
      "git",
      ["config", "--get", "remote.origin.url"],
      { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    return url || null;
  } catch {
    return null;
  }
}

export function getHead(repoRoot: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function getChangedFiles(
  repoRoot: string,
  sinceCommit: string,
  paths: string[]
): string[] {
  if (paths.length === 0) return [];

  try {
    const output = execFileSync(
      "git",
      ["diff", "--name-only", sinceCommit, "HEAD", "--", ...paths],
      { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}
