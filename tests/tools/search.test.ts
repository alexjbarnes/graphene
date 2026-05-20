import { describe, it, expect, beforeEach } from "vitest";
import type { GrapheneDatabase } from "../../src/db.js";
import { createTestRepoDb, createTestGlobalDb } from "../helpers.js";
import { handleSearch } from "../../src/tools/search.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { handleLearn } from "../../src/tools/learn.js";
import { handleLink } from "../../src/tools/link.js";

describe("search", () => {
  let repoDB: GrapheneDatabase;
  let globalDB: GrapheneDatabase;

  beforeEach(async () => {
    repoDB = await createTestRepoDb();
    globalDB = await createTestGlobalDb();
  });

  it("finds a node by name", () => {
    handleUpsertNode(repoDB, {
      name: "authentication",
      type: "subsystem",
      summary: "Handles login",
    });

    const result = handleSearch(repoDB, globalDB, { query: "authentication" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("node");
    expect(result.results[0].node_name).toBe("authentication");
  });

  it("finds a node by summary content", () => {
    handleUpsertNode(repoDB, {
      name: "auth",
      type: "subsystem",
      summary: "Handles token validation and session creation",
    });

    const result = handleSearch(repoDB, globalDB, { query: "token validation" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].node_name).toBe("auth");
  });

  it("finds observations by content", () => {
    handleUpsertNode(repoDB, { name: "api", type: "subsystem" });
    handleLearn(repoDB, {
      node_name: "api",
      content: "Rate limiting lives in middleware-throttle, not here",
    });

    const result = handleSearch(repoDB, globalDB, { query: "rate limiting" });
    expect(result.results.length).toBeGreaterThan(0);

    const obsResult = result.results.find((r) => r.type === "observation");
    expect(obsResult).toBeDefined();
    expect(obsResult!.node_name).toBe("api");
  });

  it("returns empty results for no matches", () => {
    handleUpsertNode(repoDB, { name: "auth", type: "subsystem", summary: "Auth" });
    const result = handleSearch(repoDB, globalDB, { query: "xyznonexistent" });
    expect(result.results).toEqual([]);
  });

  it("returns results from both nodes and observations", () => {
    handleUpsertNode(repoDB, {
      name: "auth",
      type: "subsystem",
      summary: "Authentication system",
    });
    handleLearn(repoDB, {
      node_name: "auth",
      content: "Authentication tokens expire after 24h",
    });

    const result = handleSearch(repoDB, globalDB, { query: "authentication" });
    const types = result.results.map((r) => r.type);
    expect(types).toContain("node");
    expect(types).toContain("observation");
  });

  it("matches any word in multi-word queries", () => {
    handleUpsertNode(repoDB, {
      name: "terminal",
      type: "subsystem",
      summary: "PTY-based terminal emulator",
    });
    handleUpsertNode(repoDB, {
      name: "ui-components",
      type: "subsystem",
      summary: "Shared React component library",
    });

    const result = handleSearch(repoDB, globalDB, { query: "terminal xterm component" });
    expect(result.results.length).toBeGreaterThanOrEqual(2);
    const names = result.results.map(r => r.node_name);
    expect(names).toContain("terminal");
    expect(names).toContain("ui-components");
  });

  it("ranks results by word match count", () => {
    handleUpsertNode(repoDB, {
      name: "auth",
      type: "subsystem",
      summary: "JWT token authentication and session management",
    });
    handleUpsertNode(repoDB, {
      name: "config",
      type: "subsystem",
      summary: "Application configuration and session timeout settings",
    });

    const result = handleSearch(repoDB, globalDB, { query: "token authentication session" });
    expect(result.results[0].node_name).toBe("auth");
    expect(result.results[0].score).toBeGreaterThan(result.results[1].score!);
  });

  it("searches project facts", () => {
    repoDB
      .prepare("INSERT INTO project_facts (category, subject, content) VALUES (?, ?, ?)")
      .run("convention", "node-env", "NODE_ENV must not be set during next build");

    const result = handleSearch(repoDB, globalDB, { query: "NODE_ENV" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("project_fact");
    expect(result.results[0].node_name).toBe("convention/node-env");
  });

  it("searches global facts", () => {
    globalDB
      .prepare("INSERT INTO facts (category, subject, content) VALUES (?, ?, ?)")
      .run("preference", "testing", "Always use TDD approach");

    const result = handleSearch(repoDB, globalDB, { query: "TDD" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("global_fact");
    expect(result.results[0].node_name).toBe("preference/testing");
  });

  it("searches edge reasons", () => {
    handleUpsertNode(repoDB, { name: "auth", type: "subsystem" });
    handleUpsertNode(repoDB, { name: "database", type: "subsystem" });
    handleLink(repoDB, {
      from: "auth",
      to: "database",
      type: "depends_on",
      reason: "stores session credentials and refresh tokens",
    });

    const result = handleSearch(repoDB, globalDB, { query: "credentials" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("edge");
    expect(result.results[0].node_name).toBe("auth -> database");
  });
});
