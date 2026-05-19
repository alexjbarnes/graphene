import initSqlJs from "sql.js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
let SQL;
function wrapDatabase(inner, filePath) {
    let txDepth = 0;
    function save() {
        if (!filePath)
            return;
        const data = inner.export();
        writeFileSync(filePath, Buffer.from(data));
    }
    const db = {
        prepare(sql) {
            return {
                get(...params) {
                    const stmt = inner.prepare(sql);
                    try {
                        stmt.bind(params.length ? params : undefined);
                        if (!stmt.step())
                            return undefined;
                        const cols = stmt.getColumnNames();
                        const vals = stmt.get();
                        const row = {};
                        for (let i = 0; i < cols.length; i++)
                            row[cols[i]] = vals[i];
                        return row;
                    }
                    finally {
                        stmt.free();
                    }
                },
                all(...params) {
                    const stmt = inner.prepare(sql);
                    try {
                        stmt.bind(params.length ? params : undefined);
                        const rows = [];
                        while (stmt.step()) {
                            const cols = stmt.getColumnNames();
                            const vals = stmt.get();
                            const row = {};
                            for (let i = 0; i < cols.length; i++)
                                row[cols[i]] = vals[i];
                            rows.push(row);
                        }
                        return rows;
                    }
                    finally {
                        stmt.free();
                    }
                },
                run(...params) {
                    inner.run(sql, params.length ? params : undefined);
                    const changes = inner.getRowsModified();
                    const result = inner.exec("SELECT last_insert_rowid()");
                    const lastInsertRowid = result.length > 0 ? result[0].values[0][0] : 0;
                    return { changes, lastInsertRowid };
                },
            };
        },
        exec(sql) {
            inner.run(sql);
            save();
        },
        pragma(cmd, opts) {
            const result = inner.exec(`PRAGMA ${cmd}`);
            if (opts?.simple) {
                if (result.length === 0)
                    return undefined;
                return result[0].values[0][0];
            }
            return result;
        },
        transaction(fn) {
            return () => {
                const sp = `sp_${txDepth}`;
                if (txDepth === 0) {
                    inner.run("BEGIN");
                }
                else {
                    inner.run(`SAVEPOINT ${sp}`);
                }
                txDepth++;
                try {
                    const result = fn();
                    txDepth--;
                    if (txDepth === 0) {
                        inner.run("COMMIT");
                        save();
                    }
                    else {
                        inner.run(`RELEASE ${sp}`);
                    }
                    return result;
                }
                catch (e) {
                    txDepth--;
                    if (txDepth === 0) {
                        inner.run("ROLLBACK");
                    }
                    else {
                        inner.run(`ROLLBACK TO ${sp}`);
                    }
                    throw e;
                }
            };
        },
        close() {
            save();
            inner.close();
        },
    };
    return db;
}
export async function initSql() {
    if (!SQL)
        SQL = await initSqlJs();
}
export function openDatabase(path) {
    mkdirSync(dirname(path), { recursive: true });
    let inner;
    if (existsSync(path)) {
        const buffer = readFileSync(path);
        inner = new SQL.Database(buffer);
    }
    else {
        inner = new SQL.Database();
    }
    inner.run("PRAGMA foreign_keys = ON");
    return wrapDatabase(inner, path);
}
export function openMemoryDatabase() {
    const inner = new SQL.Database();
    inner.run("PRAGMA foreign_keys = ON");
    return wrapDatabase(inner, null);
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