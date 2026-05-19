export function handleGlobalWrite(db, args) {
    const category = args.category;
    const subject = args.subject;
    const content = args.content;
    if (!category || !subject || !content) {
        throw new Error("category, subject, and content are required");
    }
    db.prepare(`INSERT INTO facts (category, subject, content)
     VALUES (?, ?, ?)
     ON CONFLICT(category, subject)
     DO UPDATE SET content = excluded.content, updated_at = datetime('now')`).run(category, subject, content);
    return { category, subject };
}
//# sourceMappingURL=global-write.js.map