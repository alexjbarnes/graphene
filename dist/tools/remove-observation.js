export function handleRemoveObservation(db, args) {
    const id = args.id;
    if (id === undefined)
        throw new Error("id is required");
    const result = db
        .prepare("DELETE FROM observations WHERE id = ?")
        .run(id);
    return { removed: result.changes > 0 };
}
//# sourceMappingURL=remove-observation.js.map