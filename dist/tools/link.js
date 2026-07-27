import { BIDIRECTIONAL_EDGE_TYPES } from "../types.js";
export function handleLink(db, repoId, args) {
    const from = args.from;
    const to = args.to;
    const type = args.type;
    const reason = args.reason ?? null;
    if (!from || !to || !type) {
        throw new Error("from, to, and type are required");
    }
    const fromExists = db
        .prepare("SELECT 1 FROM nodes WHERE repo_id = ? AND name = ?")
        .get(repoId, from);
    if (!fromExists)
        throw new Error(`Node not found: ${from}`);
    const toExists = db
        .prepare("SELECT 1 FROM nodes WHERE repo_id = ? AND name = ?")
        .get(repoId, to);
    if (!toExists)
        throw new Error(`Node not found: ${to}`);
    const upsertEdge = db.prepare(`INSERT INTO edges (repo_id, from_node, to_node, type, reason)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(repo_id, from_node, to_node, type) DO UPDATE SET reason = excluded.reason`);
    const bidirectional = BIDIRECTIONAL_EDGE_TYPES.has(type);
    db.transaction(() => {
        upsertEdge.run(repoId, from, to, type, reason);
        if (bidirectional) {
            upsertEdge.run(repoId, to, from, type, reason);
        }
    })();
    return { from, to, type, bidirectional };
}
//# sourceMappingURL=link.js.map