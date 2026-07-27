import { listNodes, readNode } from "../store.js";
import { getChangedFiles } from "../git.js";
export function handleStale(repoRoot, _args) {
    const names = listNodes(repoRoot);
    const staleNodes = [];
    let freshCount = 0;
    for (const name of names) {
        const node = readNode(repoRoot, name);
        if (!node)
            continue;
        if (!node.last_commit) {
            staleNodes.push({ name: node.name, reason: "untracked", changed_files: [] });
            continue;
        }
        if (node.covers.length === 0) {
            freshCount++;
            continue;
        }
        const changed = getChangedFiles(repoRoot, node.last_commit, node.covers);
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
        total_count: names.length,
    };
}
//# sourceMappingURL=stale.js.map