export function handleUpsertNode(db, args) {
    const params = args;
    if (!params.name)
        throw new Error("name is required");
    const existing = db
        .prepare("SELECT name, metadata FROM nodes WHERE name = ?")
        .get(params.name);
    if (!existing) {
        if (!params.type)
            throw new Error("type is required when creating a node");
        db.prepare(`INSERT INTO nodes (name, type, summary, entry_points, covers, last_commit, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`).run(params.name, params.type, params.summary ?? null, JSON.stringify(params.entry_points ?? []), JSON.stringify(params.covers ?? []), params.last_commit ?? null, JSON.stringify(params.metadata ?? {}));
        return { name: params.name, created: true };
    }
    const updates = [];
    const values = [];
    if (params.type !== undefined) {
        updates.push("type = ?");
        values.push(params.type);
    }
    if (params.summary !== undefined) {
        updates.push("summary = ?");
        values.push(params.summary);
    }
    if (params.entry_points !== undefined) {
        updates.push("entry_points = ?");
        values.push(JSON.stringify(params.entry_points));
    }
    if (params.covers !== undefined) {
        updates.push("covers = ?");
        values.push(JSON.stringify(params.covers));
    }
    if (params.last_commit !== undefined) {
        updates.push("last_commit = ?");
        values.push(params.last_commit);
    }
    if (params.metadata !== undefined) {
        const existingMeta = JSON.parse(existing.metadata || "{}");
        const merged = { ...existingMeta, ...params.metadata };
        updates.push("metadata = ?");
        values.push(JSON.stringify(merged));
    }
    if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        values.push(params.name);
        db.prepare(`UPDATE nodes SET ${updates.join(", ")} WHERE name = ?`).run(...values);
    }
    return { name: params.name, created: false };
}
//# sourceMappingURL=upsert-node.js.map