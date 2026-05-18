import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestRepoDb } from "../helpers.js";
import { handleSearch } from "../../src/tools/search.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { handleLearn } from "../../src/tools/learn.js";

describe("search", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestRepoDb();
  });

  it("finds a node by name", () => {
    handleUpsertNode(db, {
      name: "authentication",
      type: "subsystem",
      summary: "Handles login",
    });

    const result = handleSearch(db, { query: "authentication" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe("node");
    expect(result.results[0].node_name).toBe("authentication");
  });

  it("finds a node by summary content", () => {
    handleUpsertNode(db, {
      name: "auth",
      type: "subsystem",
      summary: "Handles token validation and session creation",
    });

    const result = handleSearch(db, { query: "token validation" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].node_name).toBe("auth");
  });

  it("finds observations by content", () => {
    handleUpsertNode(db, { name: "api", type: "subsystem" });
    handleLearn(db, {
      node_name: "api",
      content: "Rate limiting lives in middleware-throttle, not here",
    });

    const result = handleSearch(db, { query: "rate limiting" });
    expect(result.results.length).toBeGreaterThan(0);

    const obsResult = result.results.find((r) => r.type === "observation");
    expect(obsResult).toBeDefined();
    expect(obsResult!.node_name).toBe("api");
  });

  it("returns empty results for no matches", () => {
    handleUpsertNode(db, { name: "auth", type: "subsystem", summary: "Auth" });
    const result = handleSearch(db, { query: "xyznonexistent" });
    expect(result.results).toEqual([]);
  });

  it("returns results from both nodes and observations", () => {
    handleUpsertNode(db, {
      name: "auth",
      type: "subsystem",
      summary: "Authentication system",
    });
    handleLearn(db, {
      node_name: "auth",
      content: "Authentication tokens expire after 24h",
    });

    const result = handleSearch(db, { query: "authentication" });
    const types = result.results.map((r) => r.type);
    expect(types).toContain("node");
    expect(types).toContain("observation");
  });
});
