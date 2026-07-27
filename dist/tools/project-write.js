export function handleProjectWrite(db, repoId, args) {
    const category = args.category;
    const subject = args.subject;
    const content = args.content;
    if (!category || !subject || !content) {
        throw new Error("category, subject, and content are required");
    }
    db.prepare(`INSERT INTO project_facts (repo_id, category, subject, content)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(repo_id, category, subject)
     DO UPDATE SET content = excluded.content, updated_at = datetime('now')`).run(repoId, category, subject, content);
    return { category, subject };
}
//# sourceMappingURL=project-write.js.map