import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleStale } from "../../src/tools/stale.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { createTestGitRepo, type TestRepo } from "../helpers.js";
import { getHead } from "../../src/git.js";

describe("stale", () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = createTestGitRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  it("reports node with null last_commit as untracked", () => {
    handleUpsertNode(repo.path, {
      name: "auth",
      type: "subsystem",
      covers: ["auth/"],
    });

    const result = handleStale(repo.path, {});
    expect(result.stale_nodes).toHaveLength(1);
    expect(result.stale_nodes[0].name).toBe("auth");
    expect(result.stale_nodes[0].reason).toBe("untracked");
    expect(result.total_count).toBe(1);
  });

  it("reports node as fresh when no files changed", () => {
    const commit = getHead(repo.path);
    handleUpsertNode(repo.path, {
      name: "auth",
      type: "subsystem",
      covers: ["auth/"],
      last_commit: commit,
    });

    const result = handleStale(repo.path, {});
    expect(result.stale_nodes).toHaveLength(0);
    expect(result.fresh_count).toBe(1);
  });

  it("detects stale node when covered file changes", () => {
    repo.writeFile("auth/router.ts", "export const router = {};");
    const commit = repo.commit("add auth");

    handleUpsertNode(repo.path, {
      name: "auth",
      type: "subsystem",
      covers: ["auth/"],
      last_commit: commit,
    });

    repo.writeFile("auth/router.ts", "export const router = { updated: true };");
    repo.commit("update auth");

    const result = handleStale(repo.path, {});
    expect(result.stale_nodes).toHaveLength(1);
    expect(result.stale_nodes[0].name).toBe("auth");
    expect(result.stale_nodes[0].reason).toBe("changed");
    expect(result.stale_nodes[0].changed_files).toContain("auth/router.ts");
  });

  it("treats node with empty covers as fresh", () => {
    const commit = getHead(repo.path);
    handleUpsertNode(repo.path, {
      name: "misc",
      type: "module",
      covers: [],
      last_commit: commit,
    });

    const result = handleStale(repo.path, {});
    expect(result.stale_nodes).toHaveLength(0);
    expect(result.fresh_count).toBe(1);
  });

  it("returns correct counts", () => {
    const commit = getHead(repo.path);

    handleUpsertNode(repo.path, {
      name: "fresh-node",
      type: "subsystem",
      covers: ["src/"],
      last_commit: commit,
    });
    handleUpsertNode(repo.path, {
      name: "stale-node",
      type: "subsystem",
      covers: ["auth/"],
    });

    const result = handleStale(repo.path, {});
    expect(result.total_count).toBe(2);
    expect(result.fresh_count).toBe(1);
    expect(result.stale_nodes).toHaveLength(1);
  });
});
