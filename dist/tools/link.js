import { BIDIRECTIONAL_EDGE_TYPES } from "../types.js";
export function handleLink(db, args) {
    const from = args.from;
    const to = args.to;
    const type = args.type;
    const reason = args.reason ?? null;
    if (!from || !to || !type) {
        throw new Error("from, to, and type are required");
    }
    const fromExists = db.prepare("SELECT 1 FROM nodes WHERE name = ?").get(from);
    if (!fromExists)
        throw new Error(`Node not found: ${from}`);
    const toExists = db.prepare("SELECT 1 FROM nodes WHERE name = ?").get(to);
    if (!toExists)
        throw new Error(`Node not found: ${to}`);
    const upsertEdge = db.prepare(`INSERT INTO edges (from_node, to_node, type, reason)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(from_node, to_node, type) DO UPDATE SET reason = excluded.reason`);
    const bidirectional = BIDIRECTIONAL_EDGE_TYPES.has(type);
    db.transaction(() => {
        upsertEdge.run(from, to, type, reason);
        if (bidirectional) {
            upsertEdge.run(to, from, type, reason);
        }
    })();
    return { from, to, type, bidirectional };
}
//# sourceMappingURL=link.js.map