export function handleRemoveObservation(db, repoId, args) {
    const id = args.id;
    if (id === undefined)
        throw new Error("id is required");
    const result = db
        .prepare("DELETE FROM observations WHERE repo_id = ? AND id = ?")
        .run(repoId, id);
    return { removed: result.changes > 0 };
}
//# sourceMappingURL=remove-observation.js.map