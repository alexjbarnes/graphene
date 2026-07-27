// Legacy fixture dbs are built with node:sqlite itself (read-write
// DatabaseSync, plain CREATE TABLE + INSERTs matching the retired sql.js-era
// schema). This is a normal top-level import here (the test environment is
// always Node 24); only src/migrate.ts needs the lazy require, since it must
// keep working on older Node when there is nothing to migrate.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrateRepo, migrateGlobal } from "../src/migrate.js";
import { readNode, readFact, listFacts, grapheneDir, factsDir, observationId } from "../src/store.js";

// --- legacy fixture helpers ---

function createLegacyRepoDb(repoRoot: string): DatabaseSync {
  const dir = grapheneDir(repoRoot);
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "context.db"));
  db.exec(`
    CREATE TABLE nodes (
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
    CREATE TABLE edges (
      from_node TEXT NOT NULL REFERENCES nodes(name) ON DELETE CASCADE,
      to_node TEXT NOT NULL REFERENCES nodes(name) ON DELETE CASCADE,
      type TEXT NOT NULL,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (from_node, to_node, type)
    );
    CREATE TABLE observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_name TEXT NOT NULL REFERENCES nodes(name) ON DELETE CASCADE,
      content TEXT NOT NULL,
      source TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE project_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(category, subject)
    );

    -- Legacy dbs may carry FTS5 virtual tables and triggers from an even
    -- older era; migration must read straight past them without touching
    -- them (a readonly open never fires the triggers regardless).
    CREATE VIRTUAL TABLE nodes_fts USING fts5(name, summary);
    CREATE TRIGGER nodes_fts_insert AFTER INSERT ON nodes BEGIN
      INSERT INTO nodes_fts(rowid, name, summary) VALUES (new.rowid, new.name, new.summary);
    END;
  `);
  return db;
}

function createLegacyGlobalDb(homeDir: string): DatabaseSync {
  const dir = join(homeDir, ".graphene");
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "global.db"));
  db.exec(`
    CREATE TABLE facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(category, subject)
    );
  `);
  return db;
}

function insertNode(
  db: DatabaseSync,
  fields: { name: string; type?: string; summary?: string | null; lastCommit?: string | null }
): void {
  db.prepare("INSERT INTO nodes (name, type, summary, last_commit) VALUES (?, ?, ?, ?)").run(
    fields.name,
    fields.type ?? "subsystem",
    fields.summary ?? null,
    fields.lastCommit ?? null
  );
}

function insertEdge(db: DatabaseSync, from: string, to: string, type: string, reason: string | null = null): void {
  db.prepare("INSERT INTO edges (from_node, to_node, type, reason) VALUES (?, ?, ?, ?)").run(from, to, type, reason);
}

function insertObservation(
  db: DatabaseSync,
  nodeName: string,
  content: string,
  source: string | null,
  createdAt: string
): void {
  db.prepare("INSERT INTO observations (node_name, content, source, created_at) VALUES (?, ?, ?, ?)").run(
    nodeName,
    content,
    source,
    createdAt
  );
}

function insertProjectFact(db: DatabaseSync, category: string, subject: string, content: string): void {
  db.prepare("INSERT INTO project_facts (category, subject, content) VALUES (?, ?, ?)").run(
    category,
    subject,
    content
  );
}

function insertGlobalFact(db: DatabaseSync, category: string, subject: string, content: string): void {
  db.prepare("INSERT INTO facts (category, subject, content) VALUES (?, ?, ?)").run(category, subject, content);
}

// --- migrateRepo ---

describe("migrateRepo", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "graphene-migrate-repo-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("returns migrated:false with zero counts when no legacy db exists", () => {
    expect(migrateRepo(repoRoot)).toEqual({ migrated: false, nodes: 0, facts: 0, renamed: [] });
  });

  it("migrates an empty db (tables exist, zero rows): migrated true, zero counts, still renames the file", () => {
    createLegacyRepoDb(repoRoot).close();

    const result = migrateRepo(repoRoot);
    expect(result).toEqual({ migrated: true, nodes: 0, facts: 0, renamed: [] });
    expect(existsSync(join(grapheneDir(repoRoot), "context.db"))).toBe(false);
    expect(existsSync(join(grapheneDir(repoRoot), "context.db.migrated"))).toBe(true);
  });

  it("migrates a full repo: bidirectional edges, ordered observations with correct ids, and project facts", () => {
    const db = createLegacyRepoDb(repoRoot);
    insertNode(db, { name: "node_a", summary: "Node A summary", lastCommit: "abc123" });
    insertNode(db, { name: "node_b", summary: "Node B summary" });
    insertEdge(db, "node_a", "node_b", "depends_on", "a needs b");
    insertEdge(db, "node_b", "node_a", "related_to");
    insertObservation(db, "node_a", "first observation", "session-1", "2024-01-01 00:00:01");
    insertObservation(db, "node_a", "second observation", null, "2024-01-01 00:00:02");
    insertProjectFact(db, "convention", "testing", "Use vitest for tests.");
    db.close();

    const result = migrateRepo(repoRoot);
    expect(result.migrated).toBe(true);
    expect(result.nodes).toBe(2);
    expect(result.facts).toBe(1);
    expect(result.renamed).toEqual([]);

    const nodeA = readNode(repoRoot, "node_a")!;
    expect(nodeA.summary).toBe("Node A summary");
    expect(nodeA.last_commit).toBe("abc123");
    expect(nodeA.edges).toEqual([{ to: "node_b", type: "depends_on", reason: "a needs b" }]);

    const expectedId1 = observationId("first observation", new Set());
    const expectedId2 = observationId("second observation", new Set([expectedId1]));
    expect(nodeA.observations).toEqual([
      { id: expectedId1, content: "first observation", source: "session-1" },
      { id: expectedId2, content: "second observation", source: null },
    ]);

    const nodeB = readNode(repoRoot, "node_b")!;
    expect(nodeB.edges).toEqual([{ to: "node_a", type: "related_to", reason: null }]);

    expect(listFacts(factsDir(repoRoot))).toEqual([
      { category: "convention", subject: "testing", content: "Use vitest for tests." },
    ]);

    expect(existsSync(join(grapheneDir(repoRoot), "context.db"))).toBe(false);
    expect(existsSync(join(grapheneDir(repoRoot), "context.db.migrated"))).toBe(true);
  });

  it("a second migrateRepo call is a no-op: migrated false, prior migration untouched", () => {
    const db = createLegacyRepoDb(repoRoot);
    insertNode(db, { name: "solo" });
    db.close();

    migrateRepo(repoRoot);
    const second = migrateRepo(repoRoot);

    expect(second).toEqual({ migrated: false, nodes: 0, facts: 0, renamed: [] });
    expect(readNode(repoRoot, "solo")).not.toBeNull();
    expect(existsSync(join(grapheneDir(repoRoot), "context.db.migrated"))).toBe(true);
  });

  it("orders observations by created_at ascending, overriding insertion/id order", () => {
    const db = createLegacyRepoDb(repoRoot);
    insertNode(db, { name: "solo" });
    // Inserted out of chronological order: row id 1 is chronologically last.
    insertObservation(db, "solo", "third chronologically", null, "2024-01-03 00:00:00");
    insertObservation(db, "solo", "first chronologically", null, "2024-01-01 00:00:00");
    insertObservation(db, "solo", "second chronologically", null, "2024-01-02 00:00:00");
    db.close();

    migrateRepo(repoRoot);
    const node = readNode(repoRoot, "solo")!;
    expect(node.observations.map((o) => o.content)).toEqual([
      "first chronologically",
      "second chronologically",
      "third chronologically",
    ]);
  });
});

describe("migrateRepo: legacy name normalization", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "graphene-migrate-rename-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("normalizes an invalid node name, de-collides against an existing valid name, follows the rename in an edge, appends the migration observation, and normalizes an invalid fact subject", () => {
    const db = createLegacyRepoDb(repoRoot);
    insertNode(db, { name: "my-auth-service", summary: "Already valid" });
    insertNode(db, { name: "My Auth:Service", summary: "Needs normalizing" });
    insertEdge(db, "my-auth-service", "My Auth:Service", "related_to");
    insertProjectFact(db, "convention", "Node ENV", "NODE_ENV must not be set when building.");
    db.close();

    const result = migrateRepo(repoRoot);

    expect(result.renamed).toEqual([
      "My Auth:Service -> my-auth-service-2",
      "convention/Node ENV -> convention/node-env",
    ]);

    // The already-valid name is untouched and its edge follows the rename.
    const original = readNode(repoRoot, "my-auth-service")!;
    expect(original.summary).toBe("Already valid");
    expect(original.edges).toEqual([{ to: "my-auth-service-2", type: "related_to", reason: null }]);

    // The invalid name landed on the de-collided slug and carries the migration observation.
    const renamedNode = readNode(repoRoot, "my-auth-service-2")!;
    expect(renamedNode.summary).toBe("Needs normalizing");
    const migrationObs = renamedNode.observations.find((o) => o.source === "migration");
    expect(migrationObs?.content).toBe('Renamed from "My Auth:Service" during the v0.11 file migration.');

    const fact = readFact(factsDir(repoRoot), "convention", "node-env");
    expect(fact).toEqual({
      category: "convention",
      subject: "node-env",
      content: "NODE_ENV must not be set when building.",
    });
  });
});

describe("migrateRepo: gitignore rewrite on the success path", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "graphene-migrate-gitignore-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function seedMinimalDb(): void {
    const db = createLegacyRepoDb(repoRoot);
    insertNode(db, { name: "solo" });
    db.close();
  }

  it("replaces an exact '.graphene/' line, preserving other lines and the trailing newline", () => {
    writeFileSync(join(repoRoot, ".gitignore"), "node_modules/\n.graphene/\ndist/\n");
    seedMinimalDb();
    migrateRepo(repoRoot);
    expect(readFileSync(join(repoRoot, ".gitignore"), "utf-8")).toBe("node_modules/\n.graphene/*.migrated\ndist/\n");
  });

  it("replaces a bare '.graphene' line (no trailing slash)", () => {
    writeFileSync(join(repoRoot, ".gitignore"), "node_modules/\n.graphene\ndist/\n");
    seedMinimalDb();
    migrateRepo(repoRoot);
    expect(readFileSync(join(repoRoot, ".gitignore"), "utf-8")).toBe("node_modules/\n.graphene/*.migrated\ndist/\n");
  });

  it("leaves a .gitignore without that line byte-for-byte untouched", () => {
    const original = "node_modules/\ndist/\n# no graphene line here\n";
    writeFileSync(join(repoRoot, ".gitignore"), original);
    seedMinimalDb();
    migrateRepo(repoRoot);
    expect(readFileSync(join(repoRoot, ".gitignore"), "utf-8")).toBe(original);
  });

  it("leaves a missing .gitignore missing", () => {
    seedMinimalDb();
    migrateRepo(repoRoot);
    expect(existsSync(join(repoRoot, ".gitignore"))).toBe(false);
  });

  it("trims trailing whitespace before matching and preserves a missing final newline", () => {
    writeFileSync(join(repoRoot, ".gitignore"), "node_modules/\n.graphene/  \ndist/");
    seedMinimalDb();
    migrateRepo(repoRoot);
    expect(readFileSync(join(repoRoot, ".gitignore"), "utf-8")).toBe("node_modules/\n.graphene/*.migrated\ndist/");
  });
});

// --- migrateGlobal ---

describe("migrateGlobal", () => {
  let fakeHome: string;
  let globalDirPath: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "graphene-migrate-home-"));
    globalDirPath = mkdtempSync(join(tmpdir(), "graphene-migrate-globaldir-"));
    originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(globalDirPath, { recursive: true, force: true });
  });

  it("returns migrated:false when ~/.graphene/global.db does not exist", () => {
    expect(migrateGlobal(globalDirPath)).toEqual({ migrated: false, facts: 0, renamed: [] });
  });

  it("migrates global facts from ~/.graphene/global.db into globalDirPath and renames the legacy db", () => {
    const db = createLegacyGlobalDb(fakeHome);
    insertGlobalFact(db, "preference", "editor", "vim");
    insertGlobalFact(db, "preference", "shell", "zsh");
    db.close();

    const result = migrateGlobal(globalDirPath);
    expect(result).toEqual({ migrated: true, facts: 2, renamed: [] });

    expect(readFact(globalDirPath, "preference", "editor")).toEqual({
      category: "preference",
      subject: "editor",
      content: "vim",
    });
    expect(listFacts(globalDirPath)).toHaveLength(2);

    const dbPath = join(fakeHome, ".graphene", "global.db");
    expect(existsSync(dbPath)).toBe(false);
    expect(existsSync(`${dbPath}.migrated`)).toBe(true);
  });
});
