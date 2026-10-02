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
// Files under `paths` that changed between sinceCommit and HEAD in a commit
// that did not also change `nodeFile`. A node updated before `git commit`
// can only set last_commit to that commit's parent, so without this the code
// it rode in with would always read as changed. A commit that changes a
// node's covered files and its node file together is the graph riding the
// same commit as the code, so it counts as reviewed. A later node-only commit
// vouches for nothing before it, and the tree diff still decides what changed
// at all, so an unreviewed edit that was later reverted does not count.
export function getUnreviewedFiles(repoRoot, sinceCommit, paths, nodeFile) {
    const changed = getChangedFiles(repoRoot, sinceCommit, paths);
    if (changed.length === 0)
        return [];
    let output;
    try {
        output = execFileSync("git", ["log", "--format=%x00", "--name-only", `${sinceCommit}..HEAD`, "--", ...paths, nodeFile], { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    }
    catch {
        return changed;
    }
    const unreviewed = new Set();
    for (const commit of output.split("\0").slice(1)) {
        const files = commit.split("\n").filter((line) => line.length > 0);
        if (files.includes(nodeFile))
            continue;
        for (const file of files)
            unreviewed.add(file);
    }
    return changed.filter((file) => unreviewed.has(file));
}
//# sourceMappingURL=git.js.map