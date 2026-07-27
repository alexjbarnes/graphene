import { readNode, writeNode } from "../store.js";
import { BIDIRECTIONAL_EDGE_TYPES } from "../types.js";
export function handleUnlink(repoRoot, args) {
    const from = args.from;
    const to = args.to;
    const type = args.type ?? null;
    if (!from || !to)
        throw new Error("from and to are required");
    let removed = 0;
    const fromNode = readNode(repoRoot, from);
    if (fromNode) {
        const kept = fromNode.edges.filter((e) => !(e.to === to && (type === null || e.type === type)));
        if (kept.length !== fromNode.edges.length) {
            removed += fromNode.edges.length - kept.length;
            writeNode(repoRoot, { ...fromNode, edges: kept });
        }
    }
    // With no type, both directions are always cleared regardless of whether
    // any edge type present is registered bidirectional (an explicit "nuke the
    // whole relationship" request). With a type, the reverse direction is only
    // touched when that type is itself bidirectional.
    const removeReverse = type === null || BIDIRECTIONAL_EDGE_TYPES.has(type);
    if (removeReverse && to !== from) {
        const toNode = readNode(repoRoot, to);
        if (toNode) {
            const kept = toNode.edges.filter((e) => !(e.to === from && (type === null || e.type === type)));
            if (kept.length !== toNode.edges.length) {
                removed += toNode.edges.length - kept.length;
                writeNode(repoRoot, { ...toNode, edges: kept });
            }
        }
    }
    return { removed };
}
//# sourceMappingURL=unlink.js.map