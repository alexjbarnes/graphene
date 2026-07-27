import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readNode } from "../../src/store.js";
import { createTestRepo, type TestRepoDir } from "../helpers.js";
import { handleBatch } from "../../src/tools/batch.js";
import { handleRead } from "../../src/tools/read.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";

describe("batch", () => {
  let repo: TestRepoDir;

  beforeEach(() => {
    repo = createTestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  it("creates nodes, edges, and observations in one call", () => {
    const result = handleBatch(repo.repoRoot, {
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

    const auth = readNode(repo.repoRoot, "auth")!;
    expect(auth.edges).toEqual([{ to: "db", type: "depends_on", reason: "stores creds" }]);
    expect(auth.observations).toHaveLength(1);
    expect(auth.observations[0].content).toBe("Uses singleton pattern");
  });

  it("validates everything before writing anything (nothing written on error)", () => {
    expect(() =>
      handleBatch(repo.repoRoot, {
        nodes: [{ name: "auth", type: "subsystem" }],
        edges: [{ from: "auth", to: "nonexistent", type: "depends_on" }],
      })
    ).toThrow("Node not found: nonexistent");

    const index = handleRead(repo.repoRoot, {}) as { nodes: unknown[] };
    expect(index.nodes).toHaveLength(0);
  });

  it("rejects empty arrays", () => {
    expect(() => handleBatch(repo.repoRoot, { nodes: [], edges: [], observations: [] })).toThrow(
      "at least one non-empty array"
    );
  });

  it("rejects unknown keys", () => {
    expect(() => handleBatch(repo.repoRoot, { operations: [] })).toThrow("Unknown keys: operations");
  });

  it("handles missing arrays", () => {
    const result = handleBatch(repo.repoRoot, {
      nodes: [{ name: "auth", type: "subsystem" }],
    });
    expect(result.nodes_created).toBe(1);
    expect(result.edges_created).toBe(0);
    expect(result.observations_added).toBe(0);
  });

  it("creates bidirectional edges correctly", () => {
    handleBatch(repo.repoRoot, {
      nodes: [
        { name: "auth", type: "subsystem" },
        { name: "session", type: "subsystem" },
      ],
      edges: [
        { from: "auth", to: "session", type: "related_to", reason: "shared validation" },
      ],
    });

    expect(readNode(repo.repoRoot, "auth")!.edges).toHaveLength(1);
    expect(readNode(repo.repoRoot, "session")!.edges).toHaveLength(1);
  });

  it("folds multiple operations against the same node in one batch", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });

    const result = handleBatch(repo.repoRoot, {
      nodes: [{ name: "auth", summary: "Updated summary" }, { name: "session", type: "subsystem" }],
      edges: [{ from: "auth", to: "session", type: "depends_on" }],
      observations: [
        { node_name: "auth", content: "first" },
        { node_name: "auth", content: "second" },
      ],
    });

    expect(result.nodes_created).toBe(1);
    expect(result.nodes_updated).toBe(1);

    const auth = readNode(repo.repoRoot, "auth")!;
    expect(auth.summary).toBe("Updated summary");
    expect(auth.edges).toEqual([{ to: "session", type: "depends_on", reason: null }]);
    expect(auth.observations).toHaveLength(2);
    const ids = auth.observations.map((o) => o.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("leaves existing on-disk state untouched when an observation targets a missing node", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem", summary: "original" });

    expect(() =>
      handleBatch(repo.repoRoot, {
        nodes: [{ name: "auth", summary: "should not apply" }],
        observations: [{ node_name: "missing", content: "x" }],
      })
    ).toThrow("Node not found: missing");

    expect(readNode(repo.repoRoot, "auth")!.summary).toBe("original");
  });

  it("unwraps a fields object on batch nodes, same as upsert_node", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem", last_commit: "old" });

    handleBatch(repo.repoRoot, {
      nodes: [{ name: "auth", fields: { last_commit: "new" } }],
    });

    expect(readNode(repo.repoRoot, "auth")!.last_commit).toBe("new");
  });
});
