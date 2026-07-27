import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openMemoryDatabase, initSchema, ensureRepo } from "../src/db.js";
import { migrateRepo } from "../src/migrate.js";

// Build a repo dir holding a legacy (pre-repo_id) context.db, the exact shape
// earlier versions wrote.
function makeLegacyRepo(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "graphene-legacy-"));
  mkdirSync(join(root, ".graphene"), { recursive: true });
  const legacy = new Database(join(root, ".graphene", "context.db"));
  legacy.exec(`
    CREATE TABLE nodes (name TEXT PRIMARY KEY, type TEXT NOT NULL, summary TEXT,
      entry_points TEXT DEFAULT '[]', covers TEXT DEFAULT '[]', last_commit TEXT,
      metadata TEXT DEFAULT '{}', created_at TEXT, updated_at TEXT);
    CREATE TABLE edges (from_node TEXT, to_node TEXT, type TEXT, reason TEXT,
      created_at TEXT, PRIMARY KEY(from_node, to_node, type));
    CREATE TABLE observations (id INTEGER PRIMARY KEY AUTOINCREMENT, node_name TEXT,
      content TEXT, source TEXT, created_at TEXT);
    CREATE TABLE project_facts (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT,
      subject TEXT, content TEXT, created_at TEXT, updated_at TEXT, UNIQUE(category, subject));
  `);
  legacy.prepare("INSERT INTO nodes (name, type, summary, covers) VALUES (?, ?, ?, ?)")
    .run("auth", "subsystem", "Auth", '["auth/"]');
  legacy.prepare("INSERT INTO nodes (name, type) VALUES (?, ?)").run("db", "module");
  legacy.prepare("INSERT INTO edges (from_node, to_node, type, reason) VALUES (?, ?, ?, ?)")
    .run("auth", "db", "depends_on", "stores creds");
  legacy.prepare("INSERT INTO observations (node_name, content, source) VALUES (?, ?, ?)")
    .run("auth", "uses jwt", "s1");
  legacy.prepare("INSERT INTO project_facts (category, subject, content) VALUES (?, ?, ?)")
    .run("convention", "x", "y");
  legacy.close();
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe("migrateRepo", () => {
  it("imports a legacy context.db under the repo_id and renames the file", () => {
    const { root, cleanup } = makeLegacyRepo();
    try {
      const db = openMemoryDatabase();
      initSchema(db);
      const repoId = ensureRepo(db, root, null);
      migrateRepo(db, repoId, root);

      const nodes = db
        .prepare("SELECT name FROM nodes WHERE repo_id = ? ORDER BY name")
        .all(repoId)
        .map((r: Record<string, unknown>) => r.name);
      expect(nodes).toEqual(["auth", "db"]);

      const edges = db.prepare("SELECT * FROM edges WHERE repo_id = ?").all(repoId);
      expect(edges).toHaveLength(1);

      const obs = db.prepare("SELECT content FROM observations WHERE repo_id = ?").all(repoId) as Array<{ content: string }>;
      expect(obs).toHaveLength(1);
      expect(obs[0].content).toBe("uses jwt");

      const facts = db.prepare("SELECT * FROM project_facts WHERE repo_id = ?").all(repoId);
      expect(facts).toHaveLength(1);

      expect(existsSync(join(root, ".graphene", "context.db"))).toBe(false);
      expect(existsSync(join(root, ".graphene", "context.db.migrated"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("is a no-op when no legacy db exists", () => {
    const root = mkdtempSync(join(tmpdir(), "graphene-nolegacy-"));
    try {
      const db = openMemoryDatabase();
      initSchema(db);
      const repoId = ensureRepo(db, root, null);
      expect(() => migrateRepo(db, repoId, root)).not.toThrow();
      const count = db.prepare("SELECT count(*) c FROM nodes").get() as { c: number };
      expect(count.c).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not re-import after the legacy file has been renamed", () => {
    const { root, cleanup } = makeLegacyRepo();
    try {
      const db = openMemoryDatabase();
      initSchema(db);
      const repoId = ensureRepo(db, root, null);
      migrateRepo(db, repoId, root);
      migrateRepo(db, repoId, root);
      const count = db.prepare("SELECT count(*) c FROM nodes WHERE repo_id = ?").get(repoId) as { c: number };
      expect(count.c).toBe(2);
    } finally {
      cleanup();
    }
  });

  it("keeps two repos' nodes with the same name separate", () => {
    const a = makeLegacyRepo();
    const b = makeLegacyRepo();
    try {
      const db = openMemoryDatabase();
      initSchema(db);
      const repoA = ensureRepo(db, a.root, null);
      const repoB = ensureRepo(db, b.root, null);
      migrateRepo(db, repoA, a.root);
      migrateRepo(db, repoB, b.root);

      const total = db.prepare("SELECT count(*) c FROM nodes").get() as { c: number };
      expect(total.c).toBe(4);
      const authA = db.prepare("SELECT summary FROM nodes WHERE repo_id = ? AND name = 'auth'").get(repoA) as { summary: string };
      expect(authA.summary).toBe("Auth");
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });
});
