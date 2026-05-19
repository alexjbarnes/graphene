export function handleSearch(db, args) {
    const query = args.query;
    if (!query)
        throw new Error("query is required");
    const pattern = `%${query}%`;
    const results = [];
    const nodeMatches = db
        .prepare(`SELECT name, type, summary
       FROM nodes
       WHERE name LIKE ? OR summary LIKE ?`)
        .all(pattern, pattern);
    for (const m of nodeMatches) {
        results.push({ type: "node", node_name: m.name, snippet: m.summary ?? m.name });
    }
    const obsMatches = db
        .prepare(`SELECT o.node_name, o.content, o.created_at
       FROM observations o
       WHERE o.content LIKE ?`)
        .all(pattern);
    for (const m of obsMatches) {
        results.push({
            type: "observation",
            node_name: m.node_name,
            snippet: m.content,
            created_at: m.created_at,
        });
    }
    return { results };
}
//# sourceMappingURL=search.js.map