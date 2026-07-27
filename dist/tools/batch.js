import { readNode, writeNode, observationId } from "../store.js";
import { normalizeArgs, applyUpsert } from "./upsert-node.js";
import { upsertEdge } from "./link.js";
import { BIDIRECTIONAL_EDGE_TYPES } from "../types.js";
const VALID_KEYS = new Set(["nodes", "edges", "observations"]);
export function handleBatch(repoRoot, args) {
    const unknown = Object.keys(args).filter((k) => !VALID_KEYS.has(k));
    if (unknown.length > 0) {
        throw new Error(`Unknown keys: ${unknown.join(", ")}. batch accepts three top-level arrays: nodes, edges, observations.`);
    }
    const params = args;
    if (!params.nodes?.length && !params.edges?.length && !params.observations?.length) {
        throw new Error("batch requires at least one non-empty array: nodes, edges, or observations.");
    }
    // Phase A: every read and validation happens here, against an in-memory
    // working set seeded lazily from disk (`load`). Nothing is written until
    // every node, edge, and observation in the batch has validated cleanly, so
    // an error partway through (e.g. an edge to a node that does not exist)
    // leaves the on-disk state completely untouched.
    const working = new Map();
    function load(name) {
        const cached = working.get(name);
        if (cached)
            return cached;
        const existing = readNode(repoRoot, name);
        if (existing)
            working.set(name, existing);
        return existing;
    }
    const result = {
        nodes_created: 0,
        nodes_updated: 0,
        edges_created: 0,
        observations_added: 0,
    };
    if (params.nodes) {
        for (const rawNode of params.nodes) {
            const nodeParams = normalizeArgs(rawNode);
            if (!nodeParams.name)
                throw new Error("name is required");
            const existing = load(nodeParams.name);
            const applied = applyUpsert(existing, nodeParams);
            working.set(nodeParams.name, applied.node);
            if (applied.status === "created")
                result.nodes_created++;
            else
                result.nodes_updated++;
        }
    }
    if (params.edges) {
        for (const edge of params.edges) {
            const from = edge.from;
            const to = edge.to;
            const type = edge.type;
            const reason = edge.reason ?? null;
            if (!from || !to || !type)
                throw new Error("from, to, and type are required");
            const fromNode = load(from);
            if (!fromNode)
                throw new Error(`Node not found: ${from}`);
            const toNode = load(to);
            if (!toNode)
                throw new Error(`Node not found: ${to}`);
            working.set(from, upsertEdge(fromNode, to, type, reason));
            if (BIDIRECTIONAL_EDGE_TYPES.has(type)) {
                // Re-read from `working` rather than reusing `toNode`: if from ===
                // to, or an earlier edge in this same batch already touched `to`,
                // the line above (or that earlier iteration) has already replaced
                // its entry and the reverse edge must apply on top of that.
                const target = working.get(to);
                working.set(to, upsertEdge(target, from, type, reason));
            }
            result.edges_created++;
        }
    }
    if (params.observations) {
        for (const obs of params.observations) {
            const nodeName = obs.node_name;
            const content = obs.content;
            const source = obs.source ?? null;
            if (!nodeName)
                throw new Error("node_name is required");
            if (!content)
                throw new Error("content is required");
            const node = load(nodeName);
            if (!node)
                throw new Error(`Node not found: ${nodeName}`);
            const existingIds = new Set(node.observations.map((o) => o.id));
            const id = observationId(content, existingIds);
            working.set(nodeName, {
                ...node,
                observations: [...node.observations, { id, content, source }],
            });
            result.observations_added++;
        }
    }
    // Phase B: writes. Every validation above already succeeded, so this can
    // only fail on a genuine filesystem error. A crash between two of these
    // writeNode calls can still leave the batch partially applied on disk --
    // there is no cross-file atomic rename tying them together -- but no
    // single file is ever left partially written, since writeNode goes through
    // writeFileAtomic.
    for (const node of working.values()) {
        writeNode(repoRoot, node);
    }
    return result;
}
//# sourceMappingURL=batch.js.map