import { execSync } from "node:child_process";
export function getRepoRoot(cwd) {
    try {
        return execSync("git rev-parse --show-toplevel", {
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
    return execSync("git rev-parse HEAD", {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
    }).trim();
}
export function getChangedFiles(repoRoot, sinceCommit, paths) {
    if (paths.length === 0)
        return [];
    const pathArgs = paths.map((p) => `"${p}"`).join(" ");
    try {
        const output = execSync(`git diff --name-only ${sinceCommit} HEAD -- ${pathArgs}`, { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
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