export function handleProjectDelete(db, repoId, args) {
    const category = args.category;
    const subject = args.subject;
    if (!category || !subject) {
        throw new Error("category and subject are required");
    }
    const result = db
        .prepare("DELETE FROM project_facts WHERE repo_id = ? AND category = ? AND subject = ?")
        .run(repoId, category, subject);
    return { deleted: result.changes > 0 };
}
//# sourceMappingURL=project-delete.js.map