import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestRepoDb } from "../helpers.js";
import { handleRead } from "../../src/tools/read.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";

describe("read", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestRepoDb();
  });

  describe("index (no name)", () => {
    it("returns empty array when no nodes exist", () => {
      const result = handleRead(db, {});
      expect(result).toEqual({ nodes: [] });
    });

    it("returns all nodes sorted by name", () => {
      handleUpsertNode(db, { name: "zebra", type: "module" });
      handleUpsertNode(db, { name: "alpha", type: "subsystem", summary: "First" });

      const result = handleRead(db, {}) as { nodes: Array<{ name: string }> };
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].name).toBe("alpha");
      expect(result.nodes[1].name).toBe("zebra");
    });
  });

  describe("single node", () => {
    it("returns full node data", () => {
      handleUpsertNode(db, {
        name: "auth",
        type: "subsystem",
        summary: "Auth system",
        entry_points: ["auth/router.ts"],
        covers: ["auth/"],
        last_commit: "abc",
        metadata: { key: "val" },
      });

      const result = handleRead(db, { name: "auth" }) as Record<string, unknown>;
      expect(result.name).toBe("auth");
      expect(result.type).toBe("subsystem");
      expect(result.summary).toBe("Auth system");
      expect(result.entry_points).toEqual(["auth/router.ts"]);
      expect(result.covers).toEqual(["auth/"]);
      expect(result.last_commit).toBe("abc");
      expect(result.metadata).toEqual({ key: "val" });
      expect(result.observations).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.dependents).toEqual([]);
    });

    it("throws for non-existent node", () => {
      expect(() => handleRead(db, { name: "nope" })).toThrow("Node not found");
    });

    it("includes edges with neighbor summaries", () => {
      handleUpsertNode(db, { name: "auth", type: "subsystem", summary: "Auth" });
      handleUpsertNode(db, { name: "db", type: "module", summary: "Database layer" });

      db.prepare(
        "INSERT INTO edges (from_node, to_node, type, reason) VALUES (?, ?, ?, ?)"
      ).run("auth", "db", "depends_on", "stores creds");

      const result = handleRead(db, { name: "auth" }) as Record<string, unknown>;
      const edges = result.edges as Array<Record<string, unknown>>;
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        node: "db",
        type: "depends_on",
        reason: "stores creds",
        summary: "Database layer",
      });
    });

    it("includes observations ordered by created_at", () => {
      handleUpsertNode(db, { name: "auth", type: "subsystem" });

      db.prepare(
        "INSERT INTO observations (node_name, content, source) VALUES (?, ?, ?)"
      ).run("auth", "First observation", null);
      db.prepare(
        "INSERT INTO observations (node_name, content, source) VALUES (?, ?, ?)"
      ).run("auth", "Second observation", "debugging");

      const result = handleRead(db, { name: "auth" }) as Record<string, unknown>;
      const obs = result.observations as Array<Record<string, unknown>>;
      expect(obs).toHaveLength(2);
      expect(obs[0].content).toBe("First observation");
      expect(obs[1].content).toBe("Second observation");
      expect(obs[1].source).toBe("debugging");
    });

    it("includes incoming edges as dependents", () => {
      handleUpsertNode(db, { name: "auth", type: "subsystem", summary: "Auth" });
      handleUpsertNode(db, { name: "api", type: "subsystem", summary: "API layer" });
      handleUpsertNode(db, { name: "ws", type: "subsystem", summary: "WebSocket" });

      db.prepare(
        "INSERT INTO edges (from_node, to_node, type, reason) VALUES (?, ?, ?, ?)"
      ).run("api", "auth", "depends_on", "uses auth middleware");
      db.prepare(
        "INSERT INTO edges (from_node, to_node, type, reason) VALUES (?, ?, ?, ?)"
      ).run("ws", "auth", "depends_on", "validates connections");

      const result = handleRead(db, { name: "auth" }) as Record<string, unknown>;
      const dependents = result.dependents as Array<Record<string, unknown>>;
      expect(dependents).toHaveLength(2);
      expect(dependents.map((d) => d.node)).toContain("api");
      expect(dependents.map((d) => d.node)).toContain("ws");
    });

    it("includes observation IDs", () => {
      handleUpsertNode(db, { name: "auth", type: "subsystem" });
      db.prepare(
        "INSERT INTO observations (node_name, content) VALUES (?, ?)"
      ).run("auth", "Test observation");

      const result = handleRead(db, { name: "auth" }) as Record<string, unknown>;
      const obs = result.observations as Array<Record<string, unknown>>;
      expect(obs[0].id).toBeGreaterThan(0);
    });
  });
});
