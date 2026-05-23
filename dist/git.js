import { execFileSync } from "node:child_process";
export function getRepoRoot(cwd) {
    try {
        return execFileSync("git", ["rev-parse", "--show-toplevel"], {
            cwd,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
    }
    catch {
        throw new Error("Not in a git repository");
    }
}
export function getHead(repoRoot) {
    return execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
    }).trim();
}
export function getChangedFiles(repoRoot, sinceCommit, paths) {
    if (paths.length === 0)
        return [];
    try {
        const output = execFileSync("git", ["diff", "--name-only", sinceCommit, "HEAD", "--", ...paths], { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
        return output
            .trim()
            .split("\n")
            .filter((line) => line.length > 0);
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=git.js.map