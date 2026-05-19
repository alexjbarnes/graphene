export function handleRead(db, args) {
    const name = args.name;
    if (!name) {
        const rows = db
            .prepare("SELECT name, type, summary FROM nodes ORDER BY name")
            .all();
        return { nodes: rows };
    }
    const node = db.prepare("SELECT * FROM nodes WHERE name = ?").get(name);
    if (!node)
        throw new Error(`Node not found: ${name}`);
    const outgoing = db
        .prepare(`SELECT e.to_node as node, e.type, e.reason, n.summary
       FROM edges e
       JOIN nodes n ON n.name = e.to_node
       WHERE e.from_node = ?`)
        .all(name);
    const incoming = db
        .prepare(`SELECT e.from_node as node, e.type, e.reason, n.summary
       FROM edges e
       JOIN nodes n ON n.name = e.from_node
       WHERE e.to_node = ?`)
        .all(name);
    const observations = db
        .prepare(`SELECT id, content, source, created_at FROM observations
       WHERE node_name = ? ORDER BY created_at`)
        .all(name);
    return {
        name: node.name,
        type: node.type,
        summary: node.summary,
        entry_points: JSON.parse(node.entry_points || "[]"),
        covers: JSON.parse(node.covers || "[]"),
        last_commit: node.last_commit,
        metadata: JSON.parse(node.metadata || "{}"),
        observations,
        edges: outgoing,
        dependents: incoming,
    };
}
//# sourceMappingURL=read.js.map