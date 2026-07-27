import { describe, it, expect, beforeEach } from "vitest";
import type { GrapheneDatabase } from "../../src/db.js";
import { createTestRepoDb } from "../helpers.js";
import { handleSearch } from "../../src/tools/search.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { handleLearn } from "../../src/tools/learn.js";
import { handleLink } from "../../src/tools/link.js";

describe("search", () => {
  let db: GrapheneDatabase;
  let repoId: number;

  beforeEach(() => {
    ({ db, repoId } = createTestRepoDb());
  });

  it("finds a node by name", () => {
    handleUpsertNode(db, repoId, {
      name: "authentication",
      type: "subsystem",
      summary: "Handles login",
    });

    const result = handleSearch(db, repoId, { query: "authentication" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("node");
    expect(result.results[0].node_name).toBe("authentication");
  });

  it("finds a node by summary content", () => {
    handleUpsertNode(db, repoId, {
      name: "auth",
      type: "subsystem",
      summary: "Handles token validation and session creation",
    });

    const result = handleSearch(db, repoId, { query: "token validation" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].node_name).toBe("auth");
  });

  it("finds observations by content", () => {
    handleUpsertNode(db, repoId, { name: "api", type: "subsystem" });
    handleLearn(db, repoId, {
      node_name: "api",
      content: "Rate limiting lives in middleware-throttle, not here",
    });

    const result = handleSearch(db, repoId, { query: "rate limiting" });
    expect(result.results.length).toBeGreaterThan(0);

    const obsResult = result.results.find((r) => r.type === "observation");
    expect(obsResult).toBeDefined();
    expect(obsResult!.node_name).toBe("api");
  });

  it("returns empty results for no matches", () => {
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem", summary: "Auth" });
    const result = handleSearch(db, repoId, { query: "xyznonexistent" });
    expect(result.results).toEqual([]);
  });

  it("returns results from both nodes and observations", () => {
    handleUpsertNode(db, repoId, {
      name: "auth",
      type: "subsystem",
      summary: "Authentication system",
    });
    handleLearn(db, repoId, {
      node_name: "auth",
      content: "Authentication tokens expire after 24h",
    });

    const result = handleSearch(db, repoId, { query: "authentication" });
    const types = result.results.map((r) => r.type);
    expect(types).toContain("node");
    expect(types).toContain("observation");
  });

  it("matches any word in multi-word queries", () => {
    handleUpsertNode(db, repoId, {
      name: "terminal",
      type: "subsystem",
      summary: "PTY-based terminal emulator",
    });
    handleUpsertNode(db, repoId, {
      name: "ui-components",
      type: "subsystem",
      summary: "Shared React component library",
    });

    const result = handleSearch(db, repoId, { query: "terminal xterm component" });
    expect(result.results.length).toBeGreaterThanOrEqual(2);
    const names = result.results.map(r => r.node_name);
    expect(names).toContain("terminal");
    expect(names).toContain("ui-components");
  });

  it("ranks results by word match count", () => {
    handleUpsertNode(db, repoId, {
      name: "auth",
      type: "subsystem",
      summary: "JWT token authentication and session management",
    });
    handleUpsertNode(db, repoId, {
      name: "config",
      type: "subsystem",
      summary: "Application configuration and session timeout settings",
    });

    const result = handleSearch(db, repoId, { query: "token authentication session" });
    expect(result.results[0].node_name).toBe("auth");
    expect(result.results[0].score).toBeGreaterThan(result.results[1].score!);
  });

  it("searches project facts", () => {
    db
      .prepare("INSERT INTO project_facts (repo_id, category, subject, content) VALUES (?, ?, ?, ?)")
      .run(repoId, "convention", "node-env", "NODE_ENV must not be set during next build");

    const result = handleSearch(db, repoId, { query: "NODE_ENV" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("project_fact");
    expect(result.results[0].node_name).toBe("convention/node-env");
  });

  it("searches global facts", () => {
    db
      .prepare("INSERT INTO facts (category, subject, content) VALUES (?, ?, ?)")
      .run("preference", "testing", "Always use TDD approach");

    const result = handleSearch(db, repoId, { query: "TDD" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("global_fact");
    expect(result.results[0].node_name).toBe("preference/testing");
  });

  it("searches edge reasons", () => {
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem" });
    handleUpsertNode(db, repoId, { name: "database", type: "subsystem" });
    handleLink(db, repoId, {
      from: "auth",
      to: "database",
      type: "depends_on",
      reason: "stores session credentials and refresh tokens",
    });

    const result = handleSearch(db, repoId, { query: "credentials" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("edge");
    expect(result.results[0].node_name).toBe("auth -> database");
  });

  it("does not leak nodes across repos", () => {
    const other = createTestRepoDb();
    handleUpsertNode(other.db, other.repoId, {
      name: "secret",
      type: "subsystem",
      summary: "should not appear in the first repo",
    });
    handleUpsertNode(db, repoId, { name: "auth", type: "subsystem", summary: "shared word secret" });

    const result = handleSearch(db, repoId, { query: "secret" });
    const names = result.results.map((r) => r.node_name);
    expect(names).toContain("auth");
    expect(names).not.toContain("secret");
  });
});
