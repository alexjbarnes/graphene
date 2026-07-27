import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type GrapheneDatabase } from "../../src/db.js";
import { handleStale } from "../../src/tools/stale.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { createTestRepoDb, createTestGitRepo, type TestRepo } from "../helpers.js";
import { getHead } from "../../src/git.js";

describe("stale", () => {
  let db: GrapheneDatabase;
  let repoId: number;
  let repo: TestRepo;

  beforeEach(() => {
    ({ db, repoId } = createTestRepoDb());
    repo = createTestGitRepo();
  });

  afterEach(() => {
    db.close();
    repo.cleanup();
  });

  it("reports node with null last_commit as untracked", () => {
    handleUpsertNode(db, repoId, {
      name: "auth",
      type: "subsystem",
      covers: ["auth/"],
    });

    const result = handleStale(db, repoId, repo.path, {});
    expect(result.stale_nodes).toHaveLength(1);
    expect(result.stale_nodes[0].name).toBe("auth");
    expect(result.stale_nodes[0].reason).toBe("untracked");
    expect(result.total_count).toBe(1);
  });

  it("reports node as fresh when no files changed", () => {
    const commit = getHead(repo.path);
    handleUpsertNode(db, repoId, {
      name: "auth",
      type: "subsystem",
      covers: ["auth/"],
      last_commit: commit,
    });

    const result = handleStale(db, repoId, repo.path, {});
    expect(result.stale_nodes).toHaveLength(0);
    expect(result.fresh_count).toBe(1);
  });

  it("detects stale node when covered file changes", () => {
    repo.writeFile("auth/router.ts", "export const router = {};");
    const commit = repo.commit("add auth");

    handleUpsertNode(db, repoId, {
      name: "auth",
      type: "subsystem",
      covers: ["auth/"],
      last_commit: commit,
    });

    repo.writeFile("auth/router.ts", "export const router = { updated: true };");
    repo.commit("update auth");

    const result = handleStale(db, repoId, repo.path, {});
    expect(result.stale_nodes).toHaveLength(1);
    expect(result.stale_nodes[0].name).toBe("auth");
    expect(result.stale_nodes[0].reason).toBe("changed");
    expect(result.stale_nodes[0].changed_files).toContain("auth/router.ts");
  });

  it("treats node with empty covers as fresh", () => {
    const commit = getHead(repo.path);
    handleUpsertNode(db, repoId, {
      name: "misc",
      type: "module",
      covers: [],
      last_commit: commit,
    });

    const result = handleStale(db, repoId, repo.path, {});
    expect(result.stale_nodes).toHaveLength(0);
    expect(result.fresh_count).toBe(1);
  });

  it("returns correct counts", () => {
    const commit = getHead(repo.path);

    handleUpsertNode(db, repoId, {
      name: "fresh-node",
      type: "subsystem",
      covers: ["src/"],
      last_commit: commit,
    });
    handleUpsertNode(db, repoId, {
      name: "stale-node",
      type: "subsystem",
      covers: ["auth/"],
    });

    const result = handleStale(db, repoId, repo.path, {});
    expect(result.total_count).toBe(2);
    expect(result.fresh_count).toBe(1);
    expect(result.stale_nodes).toHaveLength(1);
  });
});
