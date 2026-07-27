import { describe, it, expect, beforeEach } from "vitest";
import type { GrapheneDatabase } from "../../src/db.js";
import { createTestRepoDb } from "../helpers.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";

describe("upsert_node", () => {
  let db: GrapheneDatabase;
  let repoId: number;

  beforeEach(async () => {
    ({ db, repoId } = createTestRepoDb());
  });

  it("creates a node with all fields", () => {
    const result = handleUpsertNode(db, repoId, {
      name: "auth",
      type: "subsystem",
      summary: "Handles authentication",
      entry_points: ["auth/router.ts"],
      covers: ["auth/"],
      last_commit: "abc123",
      metadata: { interfaces: ["login", "logout"] },
    });

    expect(result).toEqual({ name: "auth", status: "created" });

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
    const result = handleUpsertNode(db, repoId, { name: "api", type: "module" });
    expect(result).toEqual({ name: "api", status: "created" });

    const row = db.prepare("SELECT * FROM nodes WHERE name = ?").get("api") as Record<string, unknown>;
    expect(row.summary).toBeNull();
    expect(JSON.parse(row.entry_points as string)).toEqual([]);
  });

  it("throws when type is missing on create", () => {
    expect(() => handleUpsertNode(db, repoId, { name: "auth" })).toThrow(
      "type is required"
    );
  });

  it("updates only provided fields", () => {
    handleUpsertNode(db, repoId, {
      name: "auth",
      type: "subsystem",
      summary: "Original summary",
      entry_points: ["auth/router.ts"],
    });

    handleUpsertNode(db, repoId, { name: "auth", summary: "Updated summary" });

    const row = db.prepare("SELECT * FROM nodes WHERE name = ?").get("auth") as Record<string, unknown>;
    expect(row.summary).toBe("Updated summary");
    expect(row.type).toBe("subsystem");
    expect(JSON.parse(row.entry_points as string)).toEqual(["auth/router.ts"]);
  });

  it("shallow-merges metadata", () => {
    handleUpsertNode(db, repoId, {
      name: "auth",
      type: "subsystem",
      metadata: { interfaces: ["login"], invariants: ["session < token"] },
    });

    handleUpsertNode(db, repoId, {
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
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem" });
    const result = handleUpsertNode(db, repoId, {
      name: "auth",
      summary: "Updated",
    });
    expect(result).toEqual({ name: "auth", status: "updated", fields_updated: ["summary"] });
  });

  it("unwraps a fields object (the documented shorthand)", () => {
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem", last_commit: "old" });
    const result = handleUpsertNode(db, repoId, { name: "auth", fields: { last_commit: "new" } });
    expect(result).toEqual({ name: "auth", status: "updated", fields_updated: ["last_commit"] });
    const row = db.prepare("SELECT last_commit FROM nodes WHERE name = ?").get("auth") as Record<string, unknown>;
    expect(row.last_commit).toBe("new");
  });

  it("unwraps a fields JSON string (the silent-drop bug)", () => {
    handleUpsertNode(db, repoId, { name: "tts", type: "subsystem", last_commit: "0b76f97" });
    const result = handleUpsertNode(db, repoId, { name: "tts", fields: '{"last_commit": "9f9b245"}' });
    expect(result.status).toBe("updated");
    const row = db.prepare("SELECT last_commit FROM nodes WHERE name = ?").get("tts") as Record<string, unknown>;
    expect(row.last_commit).toBe("9f9b245");
  });

  it("merges metadata supplied inside a fields wrapper", () => {
    handleUpsertNode(db, repoId, { name: "tts", type: "subsystem", metadata: { a: "1" } });
    handleUpsertNode(db, repoId, { name: "tts", fields: { metadata: { b: "2" } } });
    const row = db.prepare("SELECT metadata FROM nodes WHERE name = ?").get("tts") as Record<string, unknown>;
    expect(JSON.parse(row.metadata as string)).toEqual({ a: "1", b: "2" });
  });

  it("coerces metadata passed as a JSON string", () => {
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem" });
    handleUpsertNode(db, repoId, { name: "auth", metadata: '{"k":"v"}' });
    const row = db.prepare("SELECT metadata FROM nodes WHERE name = ?").get("auth") as Record<string, unknown>;
    expect(JSON.parse(row.metadata as string)).toEqual({ k: "v" });
  });

  it("coerces entry_points and covers passed as JSON strings", () => {
    const result = handleUpsertNode(db, repoId, {
      name: "auth",
      type: "subsystem",
      entry_points: '["auth/router.ts"]',
      covers: '["auth/"]',
    });
    expect(result.status).toBe("created");
    const row = db.prepare("SELECT * FROM nodes WHERE name = ?").get("auth") as Record<string, unknown>;
    expect(JSON.parse(row.entry_points as string)).toEqual(["auth/router.ts"]);
    expect(JSON.parse(row.covers as string)).toEqual(["auth/"]);
  });

  it("throws on an unknown field", () => {
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem" });
    expect(() => handleUpsertNode(db, repoId, { name: "auth", lastCommit: "x" })).toThrow(
      "Unknown field"
    );
  });

  it("throws when updating an existing node with no fields", () => {
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem" });
    expect(() => handleUpsertNode(db, repoId, { name: "auth" })).toThrow(
      "no fields to update"
    );
  });

  it("throws when fields is a string but not valid JSON", () => {
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem" });
    expect(() => handleUpsertNode(db, repoId, { name: "auth", fields: "not json" })).toThrow(
      "not valid JSON"
    );
  });
});
