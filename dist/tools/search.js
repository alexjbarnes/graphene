export function handleSearch(db, args) {
    const query = args.query;
    if (!query)
        throw new Error("query is required");
    const results = [];
    const nodeMatches = db
        .prepare(`SELECT n.name, n.type,
              snippet(nodes_fts, 1, '<match>', '</match>', '...', 32) as snippet
       FROM nodes_fts
       JOIN nodes n ON n.rowid = nodes_fts.rowid
       WHERE nodes_fts MATCH ?`)
        .all(query);
    for (const m of nodeMatches) {
        results.push({ type: "node", node_name: m.name, snippet: m.snippet });
    }
    const obsMatches = db
        .prepare(`SELECT o.node_name,
              snippet(observations_fts, 0, '<match>', '</match>', '...', 32) as snippet,
              o.created_at
       FROM observations_fts
       JOIN observations o ON o.id = observations_fts.rowid
       WHERE observations_fts MATCH ?`)
        .all(query);
    for (const m of obsMatches) {
        results.push({
            type: "observation",
            node_name: m.node_name,
            snippet: m.snippet,
            created_at: m.created_at,
        });
    }
    return { results };
}
//# sourceMappingURL=search.js.map