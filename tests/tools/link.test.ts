import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestRepoDb } from "../helpers.js";
import { handleLink } from "../../src/tools/link.js";
import { handleUnlink } from "../../src/tools/unlink.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";

describe("link", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestRepoDb();
    handleUpsertNode(db, { name: "auth", type: "subsystem" });
    handleUpsertNode(db, { name: "db", type: "module" });
    handleUpsertNode(db, { name: "session", type: "subsystem" });
  });

  it("creates a directional edge", () => {
    const result = handleLink(db, {
      from: "auth",
      to: "db",
      type: "depends_on",
      reason: "stores creds",
    });

    expect(result.bidirectional).toBe(false);

    const edges = db.prepare("SELECT * FROM edges").all() as Array<Record<string, unknown>>;
    expect(edges).toHaveLength(1);
    expect(edges[0].from_node).toBe("auth");
    expect(edges[0].to_node).toBe("db");
  });

  it("creates bidirectional edges for related_to", () => {
    const result = handleLink(db, {
      from: "auth",
      to: "session",
      type: "related_to",
      reason: "shared validation",
    });

    expect(result.bidirectional).toBe(true);

    const edges = db.prepare("SELECT * FROM edges").all();
    expect(edges).toHaveLength(2);
  });

  it("creates bidirectional edges for mirrors", () => {
    handleLink(db, { from: "auth", to: "session", type: "mirrors" });
    const edges = db.prepare("SELECT * FROM edges").all();
    expect(edges).toHaveLength(2);
  });

  it("updates reason on re-link", () => {
    handleLink(db, {
      from: "auth",
      to: "db",
      type: "depends_on",
      reason: "original",
    });
    handleLink(db, {
      from: "auth",
      to: "db",
      type: "depends_on",
      reason: "updated",
    });

    const edges = db.prepare("SELECT * FROM edges").all() as Array<Record<string, unknown>>;
    expect(edges).toHaveLength(1);
    expect(edges[0].reason).toBe("updated");
  });

  it("fails if source node does not exist", () => {
    expect(() =>
      handleLink(db, { from: "nope", to: "db", type: "depends_on" })
    ).toThrow("Node not found: nope");
  });

  it("fails if target node does not exist", () => {
    expect(() =>
      handleLink(db, { from: "auth", to: "nope", type: "depends_on" })
    ).toThrow("Node not found: nope");
  });
});

describe("unlink", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestRepoDb();
    handleUpsertNode(db, { name: "auth", type: "subsystem" });
    handleUpsertNode(db, { name: "db", type: "module" });
    handleUpsertNode(db, { name: "session", type: "subsystem" });
  });

  it("removes a specific edge type", () => {
    handleLink(db, { from: "auth", to: "db", type: "depends_on" });
    const result = handleUnlink(db, {
      from: "auth",
      to: "db",
      type: "depends_on",
    });

    expect(result.removed).toBe(1);
    const edges = db.prepare("SELECT * FROM edges").all();
    expect(edges).toHaveLength(0);
  });

  it("removes all edges between nodes when no type specified", () => {
    handleLink(db, { from: "auth", to: "db", type: "depends_on" });
    handleLink(db, { from: "auth", to: "db", type: "related_to" });

    const result = handleUnlink(db, { from: "auth", to: "db" });
    expect(result.removed).toBeGreaterThan(0);

    const edges = db.prepare("SELECT * FROM edges").all();
    expect(edges).toHaveLength(0);
  });

  it("removes both directions for bidirectional types", () => {
    handleLink(db, { from: "auth", to: "session", type: "related_to" });

    const before = db.prepare("SELECT * FROM edges").all();
    expect(before).toHaveLength(2);

    const result = handleUnlink(db, {
      from: "auth",
      to: "session",
      type: "related_to",
    });
    expect(result.removed).toBe(2);

    const after = db.prepare("SELECT * FROM edges").all();
    expect(after).toHaveLength(0);
  });
});
