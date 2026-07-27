import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function openDatabase(path) {
    mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    // WAL lets concurrent sessions read while one writes; busy_timeout makes a
    // second writer wait for the lock rather than failing with SQLITE_BUSY.
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    return db;
}
export function openMemoryDatabase() {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    return db;
}
// One file holds every repo's graph plus the user's global facts. Repo-scoped
// rows carry a repo_id; global facts do not. Node identity is (repo_id, name),
// so the same node name in two repos is two distinct rows. Edges and
// observations reference nodes by (repo_id, name) and cascade on node delete.
export function initSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_path TEXT NOT NULL UNIQUE,
      remote_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS nodes (
      repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT,
      entry_points TEXT DEFAULT '[]',
      covers TEXT DEFAULT '[]',
      last_commit TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (repo_id, name)
    );

    CREATE TABLE IF NOT EXISTS edges (
      repo_id INTEGER NOT NULL,
      from_node TEXT NOT NULL,
      to_node TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (repo_id, from_node, to_node, type),
      FOREIGN KEY (repo_id, from_node) REFERENCES nodes(repo_id, name) ON DELETE CASCADE,
      FOREIGN KEY (repo_id, to_node) REFERENCES nodes(repo_id, name) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL,
      node_name TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (repo_id, node_name) REFERENCES nodes(repo_id, name) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(repo_id, category, subject)
    );

    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(category, subject)
    );
  `);
}
// Resolve a repo row to its id, creating it on first sight. root_path is the
// identity key. remote_url is captured opportunistically for a future sharing
// layer and refreshed when supplied; it is not part of identity today.
export function ensureRepo(db, rootPath, remoteUrl) {
    const existing = db
        .prepare("SELECT id FROM repos WHERE root_path = ?")
        .get(rootPath);
    if (existing) {
        if (remoteUrl) {
            db.prepare("UPDATE repos SET remote_url = ? WHERE id = ?").run(remoteUrl, existing.id);
        }
        return existing.id;
    }
    const result = db
        .prepare("INSERT INTO repos (root_path, remote_url) VALUES (?, ?)")
        .run(rootPath, remoteUrl);
    return Number(result.lastInsertRowid);
}
//# sourceMappingURL=db.js.map