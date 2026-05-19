export function handleDeleteNode(db, args) {
    const name = args.name;
    if (!name)
        throw new Error("name is required");
    const result = db
        .prepare("DELETE FROM nodes WHERE name = ?")
        .run(name);
    return { deleted: result.changes > 0 };
}
//# sourceMappingURL=delete-node.js.map