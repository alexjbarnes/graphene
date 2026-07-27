import { readNode, writeNode } from "../store.js";
import { BIDIRECTIONAL_EDGE_TYPES } from "../types.js";
// Pure core shared with batch.ts: replaces the (to, type) edge if one already
// exists (in place, so re-linking does not reshuffle edge order), else
// appends it.
export function upsertEdge(node, to, type, reason) {
    const idx = node.edges.findIndex((e) => e.to === to && e.type === type);
    const edges = [...node.edges];
    if (idx === -1)
        edges.push({ to, type, reason });
    else
        edges[idx] = { to, type, reason };
    return { ...node, edges };
}
export function handleLink(repoRoot, args) {
    const from = args.from;
    const to = args.to;
    const type = args.type;
    const reason = args.reason ?? null;
    if (!from || !to || !type) {
        throw new Error("from, to, and type are required");
    }
    const fromNode = readNode(repoRoot, from);
    if (!fromNode)
        throw new Error(`Node not found: ${from}`);
    const toNode = readNode(repoRoot, to);
    if (!toNode)
        throw new Error(`Node not found: ${to}`);
    const bidirectional = BIDIRECTIONAL_EDGE_TYPES.has(type);
    writeNode(repoRoot, upsertEdge(fromNode, to, type, reason));
    if (bidirectional) {
        writeNode(repoRoot, upsertEdge(toNode, from, type, reason));
    }
    return { from, to, type, bidirectional };
}
//# sourceMappingURL=link.js.map