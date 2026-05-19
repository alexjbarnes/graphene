export function handleLearn(db, args) {
    const nodeName = args.node_name;
    const content = args.content;
    const source = args.source ?? null;
    if (!nodeName)
        throw new Error("node_name is required");
    if (!content)
        throw new Error("content is required");
    const exists = db
        .prepare("SELECT 1 FROM nodes WHERE name = ?")
        .get(nodeName);
    if (!exists)
        throw new Error(`Node not found: ${nodeName}`);
    const result = db
        .prepare("INSERT INTO observations (node_name, content, source) VALUES (?, ?, ?)")
        .run(nodeName, content, source);
    return { id: Number(result.lastInsertRowid), node_name: nodeName };
}
//# sourceMappingURL=learn.js.map