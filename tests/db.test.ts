import { describe, it, expect } from "vitest";
import { openDatabase, openMemoryDatabase, initSchema, ensureRepo } from "../src/db.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

  it("enables WAL journal mode", () => {
    const tmp = mkdtempSync(join(tmpdir(), "graphene-db-test-"));
    try {
      const db = openDatabase(join(tmp, "test.db"));
      const mode = db.pragma("journal_mode", { simple: true });
      expect(mode).toBe("wal");
      db.close();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // The bug this whole change exists to kill: one session opened a byte snapshot
  // and never saw another session's writes. Two live connections to the same
  // file must now see each other's committed rows.
  it("a second connection sees the first connection's committed writes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "graphene-db-test-"));
    try {
      const path = join(tmp, "graphene.db");
      const a = openDatabase(path);
      initSchema(a);
      const repoId = ensureRepo(a, "/r", null);

      const b = openDatabase(path);
      a.prepare("INSERT INTO nodes (repo_id, name, type) VALUES (?, ?, ?)").run(repoId, "auth", "subsystem");

      const seen = b
        .prepare("SELECT name FROM nodes WHERE repo_id = ?")
        .all(repoId)
        .map((r: Record<string, unknown>) => r.name);
      expect(seen).toEqual(["auth"]);

      a.close();
      b.close();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("initSchema", () => {
  it("creates every table", () => {
    const db = openMemoryDatabase();
    initSchema(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: Record<string, unknown>) => r.name);

    expect(tables).toContain("repos");
    expect(tables).toContain("nodes");
    expect(tables).toContain("edges");
    expect(tables).toContain("observations");
    expect(tables).toContain("project_facts");
    expect(tables).toContain("facts");
    db.close();
  });

  it("is idempotent", () => {
    const db = openMemoryDatabase();
    initSchema(db);
    initSchema(db);
    db.close();
  });

  it("enforces foreign keys on edges", () => {
    const db = openMemoryDatabase();
    initSchema(db);
    const repoId = ensureRepo(db, "/r", null);

    expect(() => {
      db.prepare(
        "INSERT INTO edges (repo_id, from_node, to_node, type) VALUES (?, 'x', 'y', 'related_to')"
      ).run(repoId);
    }).toThrow();
    db.close();
  });

  it("enforces unique category+subject on global facts", () => {
    const db = openMemoryDatabase();
    initSchema(db);

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

describe("ensureRepo", () => {
  it("creates a repo row and returns its id", () => {
    const db = openMemoryDatabase();
    initSchema(db);
    const id = ensureRepo(db, "/home/me/proj", null);
    expect(id).toBeGreaterThan(0);
    db.close();
  });

  it("returns the same id for the same root_path", () => {
    const db = openMemoryDatabase();
    initSchema(db);
    const a = ensureRepo(db, "/home/me/proj", null);
    const b = ensureRepo(db, "/home/me/proj", null);
    expect(b).toBe(a);
    db.close();
  });

  it("gives distinct repos distinct ids", () => {
    const db = openMemoryDatabase();
    initSchema(db);
    const a = ensureRepo(db, "/home/me/one", null);
    const b = ensureRepo(db, "/home/me/two", null);
    expect(b).not.toBe(a);
    db.close();
  });

  it("backfills remote_url when later supplied", () => {
    const db = openMemoryDatabase();
    initSchema(db);
    const id = ensureRepo(db, "/home/me/proj", null);
    ensureRepo(db, "/home/me/proj", "git@github.com:me/proj.git");

    const row = db.prepare("SELECT remote_url FROM repos WHERE id = ?").get(id) as {
      remote_url: string | null;
    };
    expect(row.remote_url).toBe("git@github.com:me/proj.git");
    db.close();
  });
});
