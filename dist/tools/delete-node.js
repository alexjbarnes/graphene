export function handleDeleteNode(db, repoId, args) {
    const name = args.name;
    if (!name)
        throw new Error("name is required");
    const result = db
        .prepare("DELETE FROM nodes WHERE repo_id = ? AND name = ?")
        .run(repoId, name);
    return { deleted: result.changes > 0 };
}
//# sourceMappingURL=delete-node.js.map