import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestRepoDb } from "../helpers.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";

describe("upsert_node", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestRepoDb();
  });

  it("creates a node with all fields", () => {
    const result = handleUpsertNode(db, {
      name: "auth",
      type: "subsystem",
      summary: "Handles authentication",
      entry_points: ["auth/router.ts"],
      covers: ["auth/"],
      last_commit: "abc123",
      metadata: { interfaces: ["login", "logout"] },
    });

    expect(result).toEqual({ name: "auth", created: true });

    const row = db.prepare("SELECT * FROM nodes WHERE name = ?").get("auth") as Record<string, unknown>;
    expect(row.type).toBe("subsystem");
    expect(row.summary).toBe("Handles authentication");
    expect(JSON.parse(row.entry_points as string)).toEqual(["auth/router.ts"]);
    expect(JSON.parse(row.covers as string)).toEqual(["auth/"]);
    expect(row.last_commit).toBe("abc123");
    expect(JSON.parse(row.metadata as string)).toEqual({
      interfaces: ["login", "logout"],
    });
  });

  it("creates a node with minimal fields", () => {
    const result = handleUpsertNode(db, { name: "api", type: "module" });
    expect(result).toEqual({ name: "api", created: true });

    const row = db.prepare("SELECT * FROM nodes WHERE name = ?").get("api") as Record<string, unknown>;
    expect(row.summary).toBeNull();
    expect(JSON.parse(row.entry_points as string)).toEqual([]);
  });

  it("throws when type is missing on create", () => {
    expect(() => handleUpsertNode(db, { name: "auth" })).toThrow(
      "type is required"
    );
  });

  it("updates only provided fields", () => {
    handleUpsertNode(db, {
      name: "auth",
      type: "subsystem",
      summary: "Original summary",
      entry_points: ["auth/router.ts"],
    });

    handleUpsertNode(db, { name: "auth", summary: "Updated summary" });

    const row = db.prepare("SELECT * FROM nodes WHERE name = ?").get("auth") as Record<string, unknown>;
    expect(row.summary).toBe("Updated summary");
    expect(row.type).toBe("subsystem");
    expect(JSON.parse(row.entry_points as string)).toEqual(["auth/router.ts"]);
  });

  it("shallow-merges metadata", () => {
    handleUpsertNode(db, {
      name: "auth",
      type: "subsystem",
      metadata: { interfaces: ["login"], invariants: ["session < token"] },
    });

    handleUpsertNode(db, {
      name: "auth",
      metadata: { gotchas: ["retry is intentional"] },
    });

    const row = db.prepare("SELECT metadata FROM nodes WHERE name = ?").get("auth") as Record<string, unknown>;
    const meta = JSON.parse(row.metadata as string);
    expect(meta.interfaces).toEqual(["login"]);
    expect(meta.invariants).toEqual(["session < token"]);
    expect(meta.gotchas).toEqual(["retry is intentional"]);
  });

  it("does not require type on update", () => {
    handleUpsertNode(db, { name: "auth", type: "subsystem" });
    const result = handleUpsertNode(db, {
      name: "auth",
      summary: "Updated",
    });
    expect(result).toEqual({ name: "auth", created: false });
  });
});
