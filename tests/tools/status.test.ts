import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initRepoSchema, initGlobalSchema } from "../../src/db.js";
import { handleStatus } from "../../src/tools/status.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { createTestGitRepo, type TestRepo } from "../helpers.js";
import { getHead } from "../../src/git.js";

describe("status", () => {
  let repoDB: Database.Database;
  let globalDB: Database.Database;
  let repo: TestRepo;

  beforeEach(() => {
    repoDB = new Database(":memory:");
    repoDB.pragma("foreign_keys = ON");
    initRepoSchema(repoDB);
    globalDB = new Database(":memory:");
    initGlobalSchema(globalDB);
    repo = createTestGitRepo();
  });

  afterEach(() => {
    repoDB.close();
    globalDB.close();
    repo.cleanup();
  });

  it("returns combined context in one call", () => {
    const commit = getHead(repo.path);

    handleUpsertNode(repoDB, {
      name: "auth",
      type: "subsystem",
      summary: "Auth system",
      last_commit: commit,
      covers: ["auth/"],
    });

    globalDB
      .prepare(
        "INSERT INTO facts (category, subject, content) VALUES (?, ?, ?)"
      )
      .run("preference", "testing", "TDD only");

    const result = handleStatus(repoDB, globalDB, repo.path, {});

    expect(result.head).toMatch(/^[0-9a-f]{40}$/);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].name).toBe("auth");
    expect(result.stale_nodes).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].content).toBe("TDD only");
  });

  it("returns empty state for fresh repo", () => {
    const result = handleStatus(repoDB, globalDB, repo.path, {});
    expect(result.nodes).toEqual([]);
    expect(result.stale_nodes).toEqual([]);
    expect(result.facts).toEqual([]);
  });

  it("includes stale nodes with reason", () => {
    handleUpsertNode(repoDB, {
      name: "untracked",
      type: "subsystem",
      covers: ["src/"],
    });

    const result = handleStatus(repoDB, globalDB, repo.path, {});
    expect(result.stale_nodes).toHaveLength(1);
    expect(result.stale_nodes[0].reason).toBe("untracked");
  });
});
