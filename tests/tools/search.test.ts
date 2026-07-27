import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestRepo, createTestGlobalDir, type TestRepoDir, type TestGlobalDir } from "../helpers.js";
import { handleSearch } from "../../src/tools/search.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { handleLearn } from "../../src/tools/learn.js";
import { handleLink } from "../../src/tools/link.js";
import { handleProjectWrite } from "../../src/tools/project-write.js";
import { handleGlobalWrite } from "../../src/tools/global-write.js";

describe("search", () => {
  let repo: TestRepoDir;
  let global: TestGlobalDir;

  beforeEach(() => {
    repo = createTestRepo();
    global = createTestGlobalDir();
  });

  afterEach(() => {
    repo.cleanup();
    global.cleanup();
  });

  it("finds a node by name", () => {
    handleUpsertNode(repo.repoRoot, {
      name: "authentication",
      type: "subsystem",
      summary: "Handles login",
    });

    const result = handleSearch(repo.repoRoot, global.dir, { query: "authentication" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("node");
    expect(result.results[0].node_name).toBe("authentication");
  });

  it("finds a node by summary content", () => {
    handleUpsertNode(repo.repoRoot, {
      name: "auth",
      type: "subsystem",
      summary: "Handles token validation and session creation",
    });

    const result = handleSearch(repo.repoRoot, global.dir, { query: "token validation" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].node_name).toBe("auth");
  });

  it("finds observations by content", () => {
    handleUpsertNode(repo.repoRoot, { name: "api", type: "subsystem" });
    handleLearn(repo.repoRoot, {
      node_name: "api",
      content: "Rate limiting lives in middleware-throttle, not here",
    });

    const result = handleSearch(repo.repoRoot, global.dir, { query: "rate limiting" });
    expect(result.results.length).toBeGreaterThan(0);

    const obsResult = result.results.find((r) => r.type === "observation");
    expect(obsResult).toBeDefined();
    expect(obsResult!.node_name).toBe("api");
  });

  it("returns empty results for no matches", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem", summary: "Auth" });
    const result = handleSearch(repo.repoRoot, global.dir, { query: "xyznonexistent" });
    expect(result.results).toEqual([]);
    expect(result.omitted).toBeUndefined();
  });

  it("returns results from both nodes and observations", () => {
    handleUpsertNode(repo.repoRoot, {
      name: "auth",
      type: "subsystem",
      summary: "Authentication system",
    });
    handleLearn(repo.repoRoot, {
      node_name: "auth",
      content: "Authentication tokens expire after 24h",
    });

    const result = handleSearch(repo.repoRoot, global.dir, { query: "authentication" });
    const types = result.results.map((r) => r.type);
    expect(types).toContain("node");
    expect(types).toContain("observation");
  });

  it("matches any word in multi-word queries", () => {
    handleUpsertNode(repo.repoRoot, {
      name: "terminal",
      type: "subsystem",
      summary: "PTY-based terminal emulator",
    });
    handleUpsertNode(repo.repoRoot, {
      name: "ui-components",
      type: "subsystem",
      summary: "Shared React component library",
    });

    const result = handleSearch(repo.repoRoot, global.dir, { query: "terminal xterm component" });
    expect(result.results.length).toBeGreaterThanOrEqual(2);
    const names = result.results.map((r) => r.node_name);
    expect(names).toContain("terminal");
    expect(names).toContain("ui-components");
  });

  it("ranks results by word match count", () => {
    handleUpsertNode(repo.repoRoot, {
      name: "auth",
      type: "subsystem",
      summary: "JWT token authentication and session management",
    });
    handleUpsertNode(repo.repoRoot, {
      name: "config",
      type: "subsystem",
      summary: "Application configuration and session timeout settings",
    });

    const result = handleSearch(repo.repoRoot, global.dir, { query: "token authentication session" });
    expect(result.results[0].node_name).toBe("auth");
    expect(result.results[0].score).toBeGreaterThan(result.results[1].score);
  });

  it("searches project facts", () => {
    handleProjectWrite(repo.repoRoot, {
      category: "convention",
      subject: "node-env",
      content: "NODE_ENV must not be set during next build",
    });

    const result = handleSearch(repo.repoRoot, global.dir, { query: "NODE_ENV" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("project_fact");
    expect(result.results[0].node_name).toBe("convention/node-env");
  });

  it("searches global facts", () => {
    handleGlobalWrite(global.dir, {
      category: "preference",
      subject: "testing",
      content: "Always use TDD approach",
    });

    const result = handleSearch(repo.repoRoot, global.dir, { query: "TDD" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("global_fact");
    expect(result.results[0].node_name).toBe("preference/testing");
  });

  it("searches edge reasons", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
    handleUpsertNode(repo.repoRoot, { name: "database", type: "subsystem" });
    handleLink(repo.repoRoot, {
      from: "auth",
      to: "database",
      type: "depends_on",
      reason: "stores session credentials and refresh tokens",
    });

    const result = handleSearch(repo.repoRoot, global.dir, { query: "credentials" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("edge");
    expect(result.results[0].node_name).toBe("auth -> database");
  });

  it("caps results at 20 and reports how many were omitted", () => {
    for (let i = 0; i < 25; i++) {
      handleUpsertNode(repo.repoRoot, {
        name: `node-${String(i).padStart(2, "0")}`,
        type: "subsystem",
        summary: "matchme",
      });
    }

    const result = handleSearch(repo.repoRoot, global.dir, { query: "matchme" });
    expect(result.results).toHaveLength(20);
    expect(result.omitted).toBe(5);
  });

  it("hard-truncates snippets to 200 characters and appends an ellipsis", () => {
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
    const longContent = "matchterm " + "x".repeat(300);
    handleLearn(repo.repoRoot, { node_name: "auth", content: longContent });

    const result = handleSearch(repo.repoRoot, global.dir, { query: "matchterm" });
    const obsResult = result.results.find((r) => r.type === "observation")!;
    expect(obsResult.snippet.length).toBe(203);
    expect(obsResult.snippet.endsWith("...")).toBe(true);
  });
});
