import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readNode } from "../../src/store.js";
import { createTestRepo, type TestRepoDir } from "../helpers.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { handleLearn } from "../../src/tools/learn.js";
import { handleLink } from "../../src/tools/link.js";
import { handleDeleteNode } from "../../src/tools/delete-node.js";
import { handleRemoveObservation } from "../../src/tools/remove-observation.js";

describe("delete_node", () => {
  let repo: TestRepoDir;

  beforeEach(() => {
    repo = createTestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  it("deletes a node", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
    const result = handleDeleteNode(repo.repoRoot, { name: "auth" });
    expect(result.deleted).toBe(true);

    expect(readNode(repo.repoRoot, "auth")).toBeNull();
  });

  it("strips inbound edges from every other node that pointed at it", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
    handleUpsertNode(repo.repoRoot, { name: "api", type: "subsystem" });
    handleUpsertNode(repo.repoRoot, { name: "ws", type: "subsystem" });
    handleLink(repo.repoRoot, { from: "api", to: "auth", type: "depends_on", reason: "uses middleware" });
    handleLink(repo.repoRoot, { from: "ws", to: "auth", type: "depends_on" });
    handleLink(repo.repoRoot, { from: "api", to: "ws", type: "related_to" });

    handleDeleteNode(repo.repoRoot, { name: "auth" });

    expect(readNode(repo.repoRoot, "api")!.edges).toEqual([{ to: "ws", type: "related_to", reason: null }]);
    expect(readNode(repo.repoRoot, "ws")!.edges).toEqual([{ to: "api", type: "related_to", reason: null }]);
  });

  it("removes the node's own observations along with its file", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
    handleLearn(repo.repoRoot, { node_name: "auth", content: "test observation" });

    handleDeleteNode(repo.repoRoot, { name: "auth" });

    expect(readNode(repo.repoRoot, "auth")).toBeNull();
  });

  it("returns false for non-existent node", () => {
    const result = handleDeleteNode(repo.repoRoot, { name: "nope" });
    expect(result.deleted).toBe(false);
  });
});

describe("remove_observation", () => {
  let repo: TestRepoDir;

  beforeEach(() => {
    repo = createTestRepo();
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
  });

  afterEach(() => {
    repo.cleanup();
  });

  it("requires the node and removes a specific observation by id", () => {
    const { id } = handleLearn(repo.repoRoot, { node_name: "auth", content: "wrong observation" });
    handleLearn(repo.repoRoot, { node_name: "auth", content: "correct observation" });

    const result = handleRemoveObservation(repo.repoRoot, { node_name: "auth", id });
    expect(result.removed).toBe(true);

    const node = readNode(repo.repoRoot, "auth")!;
    expect(node.observations).toHaveLength(1);
    expect(node.observations[0].content).toBe("correct observation");
  });

  it("returns false for a non-existent id", () => {
    const result = handleRemoveObservation(repo.repoRoot, { node_name: "auth", id: "zzzz" });
    expect(result.removed).toBe(false);
  });

  it("throws when the node does not exist", () => {
    expect(() =>
      handleRemoveObservation(repo.repoRoot, { node_name: "nope", id: "abcd" })
    ).toThrow("Node not found: nope");
  });
});
