export function handleRead(db, repoId, args) {
    const name = args.name;
    if (!name) {
        const rows = db
            .prepare("SELECT name, type, summary FROM nodes WHERE repo_id = ? ORDER BY name")
            .all(repoId);
        return { nodes: rows };
    }
    const node = db
        .prepare("SELECT * FROM nodes WHERE repo_id = ? AND name = ?")
        .get(repoId, name);
    if (!node)
        throw new Error(`Node not found: ${name}`);
    const outgoing = db
        .prepare(`SELECT e.to_node as node, e.type, e.reason, n.summary
       FROM edges e
       JOIN nodes n ON n.repo_id = e.repo_id AND n.name = e.to_node
       WHERE e.repo_id = ? AND e.from_node = ?`)
        .all(repoId, name);
    const incoming = db
        .prepare(`SELECT e.from_node as node, e.type, e.reason, n.summary
       FROM edges e
       JOIN nodes n ON n.repo_id = e.repo_id AND n.name = e.from_node
       WHERE e.repo_id = ? AND e.to_node = ?`)
        .all(repoId, name);
    const observations = db
        .prepare(`SELECT id, content, source, created_at FROM observations
       WHERE repo_id = ? AND node_name = ? ORDER BY created_at`)
        .all(repoId, name);
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