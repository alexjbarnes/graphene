import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initRepoSchema } from "../../src/db.js";
import { handleStale } from "../../src/tools/stale.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { createTestGitRepo, type TestRepo } from "../helpers.js";
import { getHead } from "../../src/git.js";

describe("stale", () => {
  let db: Database.Database;
  let repo: TestRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    initRepoSchema(db);
    repo = createTestGitRepo();
  });

  afterEach(() => {
    db.close();
    repo.cleanup();
  });

  it("reports node with null last_commit as untracked", () => {
    handleUpsertNode(db, {
      name: "auth",
      type: "subsystem",
      covers: ["auth/"],
    });

    const result = handleStale(db, repo.path, {});
    expect(result.stale_nodes).toHaveLength(1);
    expect(result.stale_nodes[0].name).toBe("auth");
    expect(result.stale_nodes[0].reason).toBe("untracked");
    expect(result.total_count).toBe(1);
  });

  it("reports node as fresh when no files changed", () => {
    const commit = getHead(repo.path);
    handleUpsertNode(db, {
      name: "auth",
      type: "subsystem",
      covers: ["auth/"],
      last_commit: commit,
    });

    const result = handleStale(db, repo.path, {});
    expect(result.stale_nodes).toHaveLength(0);
    expect(result.fresh_count).toBe(1);
  });

  it("detects stale node when covered file changes", () => {
    repo.writeFile("auth/router.ts", "export const router = {};");
    const commit = repo.commit("add auth");

    handleUpsertNode(db, {
      name: "auth",
      type: "subsystem",
      covers: ["auth/"],
      last_commit: commit,
    });

    repo.writeFile("auth/router.ts", "export const router = { updated: true };");
    repo.commit("update auth");

    const result = handleStale(db, repo.path, {});
    expect(result.stale_nodes).toHaveLength(1);
    expect(result.stale_nodes[0].name).toBe("auth");
    expect(result.stale_nodes[0].reason).toBe("changed");
    expect(result.stale_nodes[0].changed_files).toContain("auth/router.ts");
  });

  it("treats node with empty covers as fresh", () => {
    const commit = getHead(repo.path);
    handleUpsertNode(db, {
      name: "misc",
      type: "module",
      covers: [],
      last_commit: commit,
    });

    const result = handleStale(db, repo.path, {});
    expect(result.stale_nodes).toHaveLength(0);
    expect(result.fresh_count).toBe(1);
  });

  it("returns correct counts", () => {
    const commit = getHead(repo.path);

    handleUpsertNode(db, {
      name: "fresh-node",
      type: "subsystem",
      covers: ["src/"],
      last_commit: commit,
    });
    handleUpsertNode(db, {
      name: "stale-node",
      type: "subsystem",
      covers: ["auth/"],
    });

    const result = handleStale(db, repo.path, {});
    expect(result.total_count).toBe(2);
    expect(result.fresh_count).toBe(1);
    expect(result.stale_nodes).toHaveLength(1);
  });
});
