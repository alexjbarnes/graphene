import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { openDatabase, initRepoSchema, initGlobalSchema } from "../src/db.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("openDatabase", () => {
  it("creates parent directories and opens database with WAL mode", () => {
    const tmp = mkdtempSync(join(tmpdir(), "graphene-db-test-"));
    try {
      const dbPath = join(tmp, "sub", "dir", "test.db");
      const db = openDatabase(dbPath);
      const mode = db.pragma("journal_mode", { simple: true });
      expect(mode).toBe("wal");
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
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
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

  it("creates FTS5 virtual tables", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    initRepoSchema(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all()
      .map((r: Record<string, unknown>) => r.name);

    expect(tables).toContain("nodes_fts");
    expect(tables).toContain("observations_fts");
    db.close();
  });

  it("is idempotent", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    initRepoSchema(db);
    initRepoSchema(db);
    db.close();
  });

  it("enforces foreign keys on edges", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    initRepoSchema(db);

    expect(() => {
      db.prepare(
        "INSERT INTO edges (from_node, to_node, type) VALUES ('x', 'y', 'related_to')"
      ).run();
    }).toThrow();
    db.close();
  });
});

describe("initGlobalSchema", () => {
  it("creates facts table", () => {
    const db = new Database(":memory:");
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
    const db = new Database(":memory:");
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
