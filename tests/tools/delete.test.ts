import { describe, it, expect, beforeEach } from "vitest";
import type { GrapheneDatabase } from "../../src/db.js";
import { createTestRepoDb } from "../helpers.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { handleLearn } from "../../src/tools/learn.js";
import { handleLink } from "../../src/tools/link.js";
import { handleDeleteNode } from "../../src/tools/delete-node.js";
import { handleRemoveObservation } from "../../src/tools/remove-observation.js";

describe("delete_node", () => {
  let db: GrapheneDatabase;
  let repoId: number;

  beforeEach(async () => {
    ({ db, repoId } = createTestRepoDb());
  });

  it("deletes a node", () => {
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem" });
    const result = handleDeleteNode(db, repoId, { name: "auth" });
    expect(result.deleted).toBe(true);

    const row = db.prepare("SELECT * FROM nodes WHERE name = ?").get("auth");
    expect(row).toBeUndefined();
  });

  it("cascades to edges", () => {
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem" });
    handleUpsertNode(db, repoId, { name: "db", type: "module" });
    handleLink(db, repoId, { from: "auth", to: "db", type: "depends_on" });

    handleDeleteNode(db, repoId, { name: "auth" });

    const edges = db.prepare("SELECT * FROM edges").all();
    expect(edges).toHaveLength(0);
  });

  it("cascades to observations", () => {
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem" });
    handleLearn(db, repoId, { node_name: "auth", content: "test observation" });

    handleDeleteNode(db, repoId, { name: "auth" });

    const obs = db.prepare("SELECT * FROM observations").all();
    expect(obs).toHaveLength(0);
  });

  it("returns false for non-existent node", () => {
    const result = handleDeleteNode(db, repoId, { name: "nope" });
    expect(result.deleted).toBe(false);
  });
});

describe("remove_observation", () => {
  let db: GrapheneDatabase;
  let repoId: number;

  beforeEach(async () => {
    ({ db, repoId } = createTestRepoDb());
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem" });
  });

  it("removes a specific observation by ID", () => {
    const { id } = handleLearn(db, repoId, {
      node_name: "auth",
      content: "wrong observation",
    });
    handleLearn(db, repoId, { node_name: "auth", content: "correct observation" });

    const result = handleRemoveObservation(db, repoId, { id });
    expect(result.removed).toBe(true);

    const obs = db.prepare("SELECT * FROM observations").all() as Array<Record<string, unknown>>;
    expect(obs).toHaveLength(1);
    expect(obs[0].content).toBe("correct observation");
  });

  it("returns false for non-existent ID", () => {
    const result = handleRemoveObservation(db, repoId, { id: 999 });
    expect(result.removed).toBe(false);
  });
});
