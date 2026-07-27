import { getChangedFiles } from "../git.js";
export function handleStale(db, repoId, repoRoot, _args) {
    const nodes = db
        .prepare("SELECT name, covers, last_commit FROM nodes WHERE repo_id = ?")
        .all(repoId);
    const staleNodes = [];
    let freshCount = 0;
    for (const node of nodes) {
        const covers = JSON.parse(node.covers || "[]");
        if (!node.last_commit) {
            staleNodes.push({ name: node.name, reason: "untracked", changed_files: [] });
            continue;
        }
        if (covers.length === 0) {
            freshCount++;
            continue;
        }
        const changed = getChangedFiles(repoRoot, node.last_commit, covers);
        if (changed.length > 0) {
            staleNodes.push({ name: node.name, reason: "changed", changed_files: changed });
        }
        else {
            freshCount++;
        }
    }
    return {
        stale_nodes: staleNodes,
        fresh_count: freshCount,
        total_count: nodes.length,
    };
}
//# sourceMappingURL=stale.js.map