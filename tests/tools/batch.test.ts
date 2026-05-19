import { describe, it, expect, beforeEach } from "vitest";
import type { GrapheneDatabase } from "../../src/db.js";
import { createTestRepoDb } from "../helpers.js";
import { handleBatch } from "../../src/tools/batch.js";
import { handleRead } from "../../src/tools/read.js";

describe("batch", () => {
  let db: GrapheneDatabase;

  beforeEach(async () => {
    db = await createTestRepoDb();
  });

  it("creates nodes, edges, and observations in one call", () => {
    const result = handleBatch(db, {
      nodes: [
        { name: "auth", type: "subsystem", summary: "Auth system" },
        { name: "db", type: "module", summary: "Database layer" },
      ],
      edges: [
        { from: "auth", to: "db", type: "depends_on", reason: "stores creds" },
      ],
      observations: [
        { node_name: "auth", content: "Uses singleton pattern" },
      ],
    });

    expect(result.nodes_created).toBe(2);
    expect(result.edges_created).toBe(1);
    expect(result.observations_added).toBe(1);
  });

  it("all operations are in a single transaction (rollback on error)", () => {
    expect(() =>
      handleBatch(db, {
        nodes: [
          { name: "auth", type: "subsystem" },
        ],
        edges: [
          { from: "auth", to: "nonexistent", type: "depends_on" },
        ],
      })
    ).toThrow();

    const index = handleRead(db, {}) as { nodes: unknown[] };
    expect(index.nodes).toHaveLength(0);
  });

  it("rejects empty arrays", () => {
    expect(() => handleBatch(db, { nodes: [], edges: [], observations: [] })).toThrow(
      "at least one non-empty array"
    );
  });

  it("rejects unknown keys", () => {
    expect(() => handleBatch(db, { operations: [] })).toThrow("Unknown keys: operations");
  });

  it("handles missing arrays", () => {
    const result = handleBatch(db, {
      nodes: [{ name: "auth", type: "subsystem" }],
    });
    expect(result.nodes_created).toBe(1);
    expect(result.edges_created).toBe(0);
    expect(result.observations_added).toBe(0);
  });

  it("creates bidirectional edges correctly", () => {
    handleBatch(db, {
      nodes: [
        { name: "auth", type: "subsystem" },
        { name: "session", type: "subsystem" },
      ],
      edges: [
        { from: "auth", to: "session", type: "related_to", reason: "shared validation" },
      ],
    });

    const edges = db.prepare("SELECT * FROM edges").all();
    expect(edges).toHaveLength(2);
  });
});
