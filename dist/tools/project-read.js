export function handleProjectRead(db, args) {
    const category = args.category;
    const subject = args.subject;
    let sql = "SELECT * FROM project_facts";
    const conditions = [];
    const params = [];
    if (category) {
        conditions.push("category = ?");
        params.push(category);
    }
    if (subject) {
        conditions.push("subject = ?");
        params.push(subject);
    }
    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY category, subject";
    const facts = db.prepare(sql).all(...params);
    return { facts };
}
//# sourceMappingURL=project-read.js.map