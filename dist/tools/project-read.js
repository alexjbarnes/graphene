export function handleProjectRead(db, repoId, args) {
    const category = args.category;
    const subject = args.subject;
    const conditions = ["repo_id = ?"];
    const params = [repoId];
    if (category) {
        conditions.push("category = ?");
        params.push(category);
    }
    if (subject) {
        conditions.push("subject = ?");
        params.push(subject);
    }
    const sql = "SELECT * FROM project_facts WHERE " +
        conditions.join(" AND ") +
        " ORDER BY category, subject";
    const facts = db.prepare(sql).all(...params);
    return { facts };
}
//# sourceMappingURL=project-read.js.map