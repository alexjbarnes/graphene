import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { GrapheneDatabase } from "../../src/db.js";
import { handleStatus } from "../../src/tools/status.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { createTestRepoDb, createTestGitRepo, type TestRepo } from "../helpers.js";
import { getHead } from "../../src/git.js";

describe("status", () => {
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

  it("returns combined context in one call", () => {
    const commit = getHead(repo.path);

    handleUpsertNode(db, repoId, {
      name: "auth",
      type: "subsystem",
      summary: "Auth system",
      last_commit: commit,
      covers: ["auth/"],
    });

    db
      .prepare("INSERT INTO facts (category, subject, content) VALUES (?, ?, ?)")
      .run("preference", "testing", "TDD only");

    const result = handleStatus(db, repoId, repo.path, {});

    expect(result.head).toMatch(/^[0-9a-f]{40}$/);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].name).toBe("auth");
    expect(result.stale_nodes).toHaveLength(0);
    expect(result.global_facts).toHaveLength(1);
    expect(result.global_facts[0].content).toBe("TDD only");
  });

  it("returns empty state for fresh repo", () => {
    const result = handleStatus(db, repoId, repo.path, {});
    expect(result.nodes).toEqual([]);
    expect(result.stale_nodes).toEqual([]);
    expect(result.project_facts).toEqual([]);
    expect(result.global_facts).toEqual([]);
    expect(result.observations_by_node).toEqual({});
  });

  it("includes recent observations per node", () => {
    const commit = getHead(repo.path);
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem", last_commit: commit });

    db.prepare("INSERT INTO observations (repo_id, node_name, content) VALUES (?, ?, ?)").run(repoId, "auth", "uses JWT tokens");
    db.prepare("INSERT INTO observations (repo_id, node_name, content) VALUES (?, ?, ?)").run(repoId, "auth", "middleware in router.ts");

    const result = handleStatus(db, repoId, repo.path, {});
    expect(result.observations_by_node["auth"]).toHaveLength(2);
    expect(result.observations_by_node["auth"]).toContain("uses JWT tokens");
  });

  it("includes project facts", () => {
    db
      .prepare("INSERT INTO project_facts (repo_id, category, subject, content) VALUES (?, ?, ?, ?)")
      .run(repoId, "convention", "node-env", "NODE_ENV must not be set for next build");

    const result = handleStatus(db, repoId, repo.path, {});
    expect(result.project_facts).toHaveLength(1);
    expect(result.project_facts[0].content).toContain("NODE_ENV");
  });

  it("includes stale nodes with reason", () => {
    handleUpsertNode(db, repoId, {
      name: "untracked",
      type: "subsystem",
      covers: ["src/"],
    });

    const result = handleStatus(db, repoId, repo.path, {});
    expect(result.stale_nodes).toHaveLength(1);
    expect(result.stale_nodes[0].reason).toBe("untracked");
  });

  it("scopes nodes and facts to the given repo", () => {
    const other = createTestRepoDb();
    handleUpsertNode(other.db, other.repoId, { name: "elsewhere", type: "subsystem" });
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem" });

    const result = handleStatus(db, repoId, repo.path, {});
    expect(result.nodes.map((n) => n.name)).toEqual(["auth"]);
  });
});
