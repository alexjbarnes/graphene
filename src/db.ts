import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

interface Statement {
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): RunResult;
}

export interface GrapheneDatabase {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  pragma(cmd: string, opts?: { simple: boolean }): unknown;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

function wrapDatabase(inner: SqlJsDatabase, filePath: string | null): GrapheneDatabase {
  let txDepth = 0;

  function save() {
    if (!filePath) return;
    const data = inner.export();
    writeFileSync(filePath, Buffer.from(data));
  }

  const db: GrapheneDatabase = {
    prepare(sql: string): Statement {
      return {
        get(...params: unknown[]): Record<string, unknown> | undefined {
          const stmt = inner.prepare(sql);
          try {
            stmt.bind(params.length ? params : undefined);
            if (!stmt.step()) return undefined;
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            const row: Record<string, unknown> = {};
            for (let i = 0; i < cols.length; i++) row[cols[i]] = vals[i];
            return row;
          } finally {
            stmt.free();
          }
        },
        all(...params: unknown[]): Record<string, unknown>[] {
          const stmt = inner.prepare(sql);
          try {
            stmt.bind(params.length ? params : undefined);
            const rows: Record<string, unknown>[] = [];
            while (stmt.step()) {
              const cols = stmt.getColumnNames();
              const vals = stmt.get();
              const row: Record<string, unknown> = {};
              for (let i = 0; i < cols.length; i++) row[cols[i]] = vals[i];
              rows.push(row);
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...params: unknown[]): RunResult {
          inner.run(sql, params.length ? params : undefined);
          const changes = inner.getRowsModified();
          const result = inner.exec("SELECT last_insert_rowid()");
          const lastInsertRowid = result.length > 0 ? (result[0].values[0][0] as number) : 0;
          if (txDepth === 0) save();
          return { changes, lastInsertRowid };
        },
      };
    },

    exec(sql: string): void {
      inner.run(sql);
      if (txDepth === 0) save();
    },

    pragma(cmd: string, opts?: { simple: boolean }): unknown {
      const result = inner.exec(`PRAGMA ${cmd}`);
      if (opts?.simple) {
        if (result.length === 0) return undefined;
        return result[0].values[0][0];
      }
      return result;
    },

    transaction<T>(fn: () => T): () => T {
      return () => {
        const sp = `sp_${txDepth}`;
        if (txDepth === 0) {
          inner.run("BEGIN");
        } else {
          inner.run(`SAVEPOINT ${sp}`);
        }
        txDepth++;
        try {
          const result = fn();
          txDepth--;
          if (txDepth === 0) {
            inner.run("COMMIT");
            save();
          } else {
            inner.run(`RELEASE ${sp}`);
          }
          return result;
        } catch (e) {
          txDepth--;
          if (txDepth === 0) {
            inner.run("ROLLBACK");
          } else {
            inner.run(`ROLLBACK TO ${sp}`);
          }
          throw e;
        }
      };
    },

    close(): void {
      save();
      inner.close();
    },
  };

  return db;
}

export async function initSql(): Promise<void> {
  if (!SQL) SQL = await initSqlJs();
}

export function openDatabase(path: string): GrapheneDatabase {
  mkdirSync(dirname(path), { recursive: true });
  let inner: SqlJsDatabase;
  if (existsSync(path)) {
    const buffer = readFileSync(path);
    inner = new SQL.Database(buffer);
  } else {
    inner = new SQL.Database();
  }
  inner.run("PRAGMA foreign_keys = ON");
  return wrapDatabase(inner, path);
}

export function openMemoryDatabase(): GrapheneDatabase {
  const inner = new SQL.Database();
  inner.run("PRAGMA foreign_keys = ON");
  return wrapDatabase(inner, null);
}

export function initRepoSchema(db: GrapheneDatabase): void {
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

    CREATE TABLE IF NOT EXISTS project_facts (
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

export function initGlobalSchema(db: GrapheneDatabase): void {
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
