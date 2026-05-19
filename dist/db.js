import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function openDatabase(path) {
    mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return db;
}
export function initRepoSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      name TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      summary TEXT,
      entry_points TEXT DEFAULT '[]',
      covers TEXT DEFAULT '[]',
      last_commit TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS edges (
      from_node TEXT NOT NULL REFERENCES nodes(name) ON DELETE CASCADE,
      to_node TEXT NOT NULL REFERENCES nodes(name) ON DELETE CASCADE,
      type TEXT NOT NULL,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (from_node, to_node, type)
    );

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_name TEXT NOT NULL REFERENCES nodes(name) ON DELETE CASCADE,
      content TEXT NOT NULL,
      source TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
    initFts(db);
}
function initFts(db) {
    const hasFts = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes_fts'")
        .get();
    if (hasFts)
        return;
    db.exec(`
    CREATE VIRTUAL TABLE nodes_fts USING fts5(
      name, summary, content='nodes', content_rowid='rowid'
    );

    CREATE VIRTUAL TABLE observations_fts USING fts5(
      content, content='observations', content_rowid='id'
    );

    CREATE TRIGGER nodes_fts_insert AFTER INSERT ON nodes BEGIN
      INSERT INTO nodes_fts(rowid, name, summary)
      VALUES (new.rowid, new.name, new.summary);
    END;

    CREATE TRIGGER nodes_fts_delete AFTER DELETE ON nodes BEGIN
      INSERT INTO nodes_fts(nodes_fts, rowid, name, summary)
      VALUES ('delete', old.rowid, old.name, old.summary);
    END;

    CREATE TRIGGER nodes_fts_update AFTER UPDATE ON nodes BEGIN
      INSERT INTO nodes_fts(nodes_fts, rowid, name, summary)
      VALUES ('delete', old.rowid, old.name, old.summary);
      INSERT INTO nodes_fts(rowid, name, summary)
      VALUES (new.rowid, new.name, new.summary);
    END;

    CREATE TRIGGER observations_fts_insert AFTER INSERT ON observations BEGIN
      INSERT INTO observations_fts(rowid, content)
      VALUES (new.id, new.content);
    END;

    CREATE TRIGGER observations_fts_delete AFTER DELETE ON observations BEGIN
      INSERT INTO observations_fts(observations_fts, rowid, content)
      VALUES ('delete', old.id, old.content);
    END;
  `);
}
export function initGlobalSchema(db) {
    db.exec(`
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
//# sourceMappingURL=db.js.map