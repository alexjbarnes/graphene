import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readNode } from "../../src/store.js";
import { createTestRepo, type TestRepoDir } from "../helpers.js";
import { handleLink } from "../../src/tools/link.js";
import { handleUnlink } from "../../src/tools/unlink.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";

describe("link", () => {
  let repo: TestRepoDir;

  beforeEach(() => {
    repo = createTestRepo();
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
    handleUpsertNode(repo.repoRoot, { name: "db", type: "module" });
    handleUpsertNode(repo.repoRoot, { name: "session", type: "subsystem" });
  });

  afterEach(() => {
    repo.cleanup();
  });

  it("creates a directional edge", () => {
    const result = handleLink(repo.repoRoot, {
      from: "auth",
      to: "db",
      type: "depends_on",
      reason: "stores creds",
    });

    expect(result.bidirectional).toBe(false);

    const auth = readNode(repo.repoRoot, "auth")!;
    expect(auth.edges).toEqual([{ to: "db", type: "depends_on", reason: "stores creds" }]);
    const db = readNode(repo.repoRoot, "db")!;
    expect(db.edges).toEqual([]);
  });

  it("creates bidirectional edges for related_to", () => {
    const result = handleLink(repo.repoRoot, {
      from: "auth",
      to: "session",
      type: "related_to",
      reason: "shared validation",
    });

    expect(result.bidirectional).toBe(true);

    expect(readNode(repo.repoRoot, "auth")!.edges).toHaveLength(1);
    expect(readNode(repo.repoRoot, "session")!.edges).toHaveLength(1);
  });

  it("creates bidirectional edges for mirrors", () => {
    handleLink(repo.repoRoot, { from: "auth", to: "session", type: "mirrors" });
    expect(readNode(repo.repoRoot, "auth")!.edges).toHaveLength(1);
    expect(readNode(repo.repoRoot, "session")!.edges).toHaveLength(1);
  });

  it("updates reason on re-link", () => {
    handleLink(repo.repoRoot, { from: "auth", to: "db", type: "depends_on", reason: "original" });
    handleLink(repo.repoRoot, { from: "auth", to: "db", type: "depends_on", reason: "updated" });

    const auth = readNode(repo.repoRoot, "auth")!;
    expect(auth.edges).toHaveLength(1);
    expect(auth.edges[0].reason).toBe("updated");
  });

  it("fails if source node does not exist", () => {
    expect(() =>
      handleLink(repo.repoRoot, { from: "nope", to: "db", type: "depends_on" })
    ).toThrow("Node not found: nope");
  });

  it("fails if target node does not exist", () => {
    expect(() =>
      handleLink(repo.repoRoot, { from: "auth", to: "nope", type: "depends_on" })
    ).toThrow("Node not found: nope");
  });

  it("supports a self-link without duplicating or losing the edge", () => {
    const result = handleLink(repo.repoRoot, {
      from: "auth",
      to: "auth",
      type: "related_to",
      reason: "self note",
    });
    expect(result.bidirectional).toBe(true);

    const auth = readNode(repo.repoRoot, "auth")!;
    expect(auth.edges).toEqual([{ to: "auth", type: "related_to", reason: "self note" }]);
  });
});

describe("unlink", () => {
  let repo: TestRepoDir;

  beforeEach(() => {
    repo = createTestRepo();
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
    handleUpsertNode(repo.repoRoot, { name: "db", type: "module" });
    handleUpsertNode(repo.repoRoot, { name: "session", type: "subsystem" });
  });

  afterEach(() => {
    repo.cleanup();
  });

  it("removes a specific edge type", () => {
    handleLink(repo.repoRoot, { from: "auth", to: "db", type: "depends_on" });
    const result = handleUnlink(repo.repoRoot, { from: "auth", to: "db", type: "depends_on" });

    expect(result.removed).toBe(1);
    expect(readNode(repo.repoRoot, "auth")!.edges).toEqual([]);
  });

  it("removes all edges between nodes when no type specified", () => {
    handleLink(repo.repoRoot, { from: "auth", to: "db", type: "depends_on" });
    handleLink(repo.repoRoot, { from: "auth", to: "db", type: "related_to" });

    const result = handleUnlink(repo.repoRoot, { from: "auth", to: "db" });
    expect(result.removed).toBeGreaterThan(0);

    expect(readNode(repo.repoRoot, "auth")!.edges).toEqual([]);
    expect(readNode(repo.repoRoot, "db")!.edges).toEqual([]);
  });

  it("removes both directions for bidirectional types", () => {
    handleLink(repo.repoRoot, { from: "auth", to: "session", type: "related_to" });

    expect(readNode(repo.repoRoot, "auth")!.edges).toHaveLength(1);
    expect(readNode(repo.repoRoot, "session")!.edges).toHaveLength(1);

    const result = handleUnlink(repo.repoRoot, { from: "auth", to: "session", type: "related_to" });
    expect(result.removed).toBe(2);

    expect(readNode(repo.repoRoot, "auth")!.edges).toEqual([]);
    expect(readNode(repo.repoRoot, "session")!.edges).toEqual([]);
  });

  it("does not touch the reverse direction for a non-bidirectional type", () => {
    handleLink(repo.repoRoot, { from: "auth", to: "db", type: "depends_on" });
    handleLink(repo.repoRoot, { from: "db", to: "auth", type: "depends_on" });

    const result = handleUnlink(repo.repoRoot, { from: "auth", to: "db", type: "depends_on" });
    expect(result.removed).toBe(1);

    expect(readNode(repo.repoRoot, "auth")!.edges).toEqual([]);
    expect(readNode(repo.repoRoot, "db")!.edges).toEqual([{ to: "auth", type: "depends_on", reason: null }]);
  });

  it("is a no-op (not an error) when there is nothing to remove", () => {
    const result = handleUnlink(repo.repoRoot, { from: "auth", to: "db" });
    expect(result.removed).toBe(0);
  });
});
