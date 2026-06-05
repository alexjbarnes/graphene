import { describe, it, expect, beforeAll } from "vitest";
import { initSql, openDatabase, openMemoryDatabase, initRepoSchema, initGlobalSchema } from "../src/db.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

beforeAll(async () => {
  await initSql();
});

describe("openDatabase", () => {
  it("creates parent directories and opens database", () => {
    const tmp = mkdtempSync(join(tmpdir(), "graphene-db-test-"));
    try {
      const dbPath = join(tmp, "sub", "dir", "test.db");
      const db = openDatabase(dbPath);
      const fk = db.pragma("foreign_keys", { simple: true });
      expect(fk).toBe(1);
      db.close();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("enables foreign keys", () => {
    const tmp = mkdtempSync(join(tmpdir(), "graphene-db-test-"));
    try {
      const db = openDatabase(join(tmp, "test.db"));
      const fk = db.pragma("foreign_keys", { simple: true });
      expect(fk).toBe(1);
      db.close();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("initRepoSchema", () => {
  it("creates nodes, edges, observations tables", () => {
    const db = openMemoryDatabase();
    initRepoSchema(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all()
      .map((r: Record<string, unknown>) => r.name);

    expect(tables).toContain("nodes");
    expect(tables).toContain("edges");
    expect(tables).toContain("observations");
    db.close();
  });

  it("is idempotent", () => {
    const db = openMemoryDatabase();
    initRepoSchema(db);
    initRepoSchema(db);
    db.close();
  });

  it("enforces foreign keys on edges", () => {
    const db = openMemoryDatabase();
    initRepoSchema(db);

    expect(() => {
      db.prepare(
        "INSERT INTO edges (from_node, to_node, type) VALUES ('x', 'y', 'related_to')"
      ).run();
    }).toThrow();
    db.close();
  });

  it("drops legacy FTS5 triggers so writes succeed on an upgraded database", () => {
    const db = openMemoryDatabase();
    initRepoSchema(db);

    // Simulate a pre-migration database: a leftover trigger of the same name
    // the FTS5-era schema used. A real fts5 virtual table cannot be created
    // here (the bundled sql.js has no fts5 module), so a RAISE trigger stands
    // in for the write failure the real one caused.
    db.exec(
      "CREATE TRIGGER nodes_fts_insert AFTER INSERT ON nodes BEGIN SELECT RAISE(ABORT, 'legacy fts trigger'); END"
    );

    expect(() => {
      db.prepare("INSERT INTO nodes (name, type) VALUES ('x', 'subsystem')").run();
    }).toThrow();

    // Re-running initRepoSchema must drop the legacy trigger.
    initRepoSchema(db);

    expect(() => {
      db.prepare("INSERT INTO nodes (name, type) VALUES ('y', 'subsystem')").run();
    }).not.toThrow();

    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
      .all()
      .map((r: Record<string, unknown>) => r.name);
    expect(triggers).not.toContain("nodes_fts_insert");
    db.close();
  });
});

describe("initGlobalSchema", () => {
  it("creates facts table", () => {
    const db = openMemoryDatabase();
    initGlobalSchema(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all()
      .map((r: Record<string, unknown>) => r.name);

    expect(tables).toContain("facts");
    db.close();
  });

  it("enforces unique category+subject", () => {
    const db = openMemoryDatabase();
    initGlobalSchema(db);

    db.prepare(
      "INSERT INTO facts (category, subject, content) VALUES ('pref', 'go', 'use std')"
    ).run();

    expect(() => {
      db.prepare(
        "INSERT INTO facts (category, subject, content) VALUES ('pref', 'go', 'other')"
      ).run();
    }).toThrow();
    db.close();
  });
});
