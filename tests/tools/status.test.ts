import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleStatus } from "../../src/tools/status.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { handleLearn } from "../../src/tools/learn.js";
import { handleProjectWrite } from "../../src/tools/project-write.js";
import { handleGlobalWrite } from "../../src/tools/global-write.js";
import { createTestGitRepo, createTestGlobalDir, type TestRepo, type TestGlobalDir } from "../helpers.js";
import { getHead } from "../../src/git.js";

describe("status", () => {
  let repo: TestRepo;
  let global: TestGlobalDir;

  beforeEach(() => {
    repo = createTestGitRepo();
    global = createTestGlobalDir();
  });

  afterEach(() => {
    repo.cleanup();
    global.cleanup();
  });

  it("returns combined context in one call", () => {
    const commit = getHead(repo.path);

    handleUpsertNode(repo.path, {
      name: "auth",
      type: "subsystem",
      summary: "Auth system",
      last_commit: commit,
      covers: ["auth/"],
    });

    handleGlobalWrite(global.dir, { category: "preference", subject: "testing", content: "TDD only" });

    const result = handleStatus(repo.path, global.dir, {});

    expect(result.head).toMatch(/^[0-9a-f]{40}$/);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].name).toBe("auth");
    expect(result.stale_nodes).toHaveLength(0);
    expect(result.global_facts.count).toBe(1);
    expect(result.global_facts.keys).toEqual(["preference/testing"]);
  });

  it("returns empty state for fresh repo", () => {
    const result = handleStatus(repo.path, global.dir, {});
    expect(result.nodes).toEqual([]);
    expect(result.stale_nodes).toEqual([]);
    expect(result.project_facts).toEqual({ count: 0, keys: [] });
    expect(result.global_facts).toEqual({ count: 0, keys: [] });
  });

  it("includes an observation_count per node but never observation bodies", () => {
    const commit = getHead(repo.path);
    handleUpsertNode(repo.path, { name: "auth", type: "subsystem", last_commit: commit });

    handleLearn(repo.path, { node_name: "auth", content: "uses JWT tokens, never sessions" });
    handleLearn(repo.path, { node_name: "auth", content: "middleware lives in router.ts" });

    const result = handleStatus(repo.path, global.dir, {});
    expect(result.nodes[0].observation_count).toBe(2);
    expect(JSON.stringify(result)).not.toContain("uses JWT tokens");
  });

  it("includes project fact counts and keys but never fact bodies", () => {
    handleProjectWrite(repo.path, {
      category: "convention",
      subject: "node-env",
      content: "NODE_ENV must not be set for next build",
    });

    const result = handleStatus(repo.path, global.dir, {});
    expect(result.project_facts.count).toBe(1);
    expect(result.project_facts.keys).toEqual(["convention/node-env"]);
    expect(JSON.stringify(result)).not.toContain("NODE_ENV must not be set");
  });

  it("includes stale nodes with reason", () => {
    handleUpsertNode(repo.path, {
      name: "untracked",
      type: "subsystem",
      covers: ["src/"],
    });

    const result = handleStatus(repo.path, global.dir, {});
    expect(result.stale_nodes).toHaveLength(1);
    expect(result.stale_nodes[0].reason).toBe("untracked");
  });

  it("caps fact keys at 50 with a trailing +N more entry", () => {
    for (let i = 0; i < 55; i++) {
      handleProjectWrite(repo.path, {
        category: "convention",
        subject: `rule-${String(i).padStart(3, "0")}`,
        content: "content",
      });
    }

    const result = handleStatus(repo.path, global.dir, {});
    expect(result.project_facts.count).toBe(55);
    expect(result.project_facts.keys).toHaveLength(51);
    expect(result.project_facts.keys[50]).toBe("+5 more");
  });
});
