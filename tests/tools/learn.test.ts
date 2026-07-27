import { describe, it, expect, beforeEach } from "vitest";
import type { GrapheneDatabase } from "../../src/db.js";
import { createTestRepoDb } from "../helpers.js";
import { handleLearn } from "../../src/tools/learn.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";

describe("learn", () => {
  let db: GrapheneDatabase;
  let repoId: number;

  beforeEach(async () => {
    ({ db, repoId } = createTestRepoDb());
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem" });
  });

  it("appends an observation to a node", () => {
    const result = handleLearn(db, repoId, {
      node_name: "auth",
      content: "Rate limiting lives in middleware, not here",
    });

    expect(result.node_name).toBe("auth");
    expect(result.id).toBeGreaterThan(0);

    const obs = db
      .prepare("SELECT * FROM observations WHERE node_name = ?")
      .all("auth") as Array<Record<string, unknown>>;
    expect(obs).toHaveLength(1);
    expect(obs[0].content).toBe("Rate limiting lives in middleware, not here");
    expect(obs[0].source).toBeNull();
  });

  it("appends multiple observations without overwriting", () => {
    handleLearn(db, repoId, { node_name: "auth", content: "First" });
    handleLearn(db, repoId, { node_name: "auth", content: "Second" });

    const obs = db
      .prepare("SELECT * FROM observations WHERE node_name = ?")
      .all("auth");
    expect(obs).toHaveLength(2);
  });

  it("fails on non-existent node", () => {
    expect(() =>
      handleLearn(db, repoId, { node_name: "nope", content: "something" })
    ).toThrow("Node not found: nope");
  });

  it("stores optional source field", () => {
    handleLearn(db, repoId, {
      node_name: "auth",
      content: "Discovered during debugging",
      source: "session-2024-03-15",
    });

    const obs = db
      .prepare("SELECT source FROM observations WHERE node_name = ?")
      .get("auth") as Record<string, unknown>;
    expect(obs.source).toBe("session-2024-03-15");
  });
});
