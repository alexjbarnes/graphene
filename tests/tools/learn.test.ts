import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { readNode, nodePath } from "../../src/store.js";
import { createTestRepo, type TestRepoDir } from "../helpers.js";
import { handleLearn } from "../../src/tools/learn.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";

describe("learn", () => {
  let repo: TestRepoDir;

  beforeEach(() => {
    repo = createTestRepo();
    handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
  });

  afterEach(() => {
    repo.cleanup();
  });

  it("appends an observation to a node", () => {
    const result = handleLearn(repo.repoRoot, {
      node_name: "auth",
      content: "Rate limiting lives in middleware, not here",
    });

    expect(result.node_name).toBe("auth");
    expect(typeof result.id).toBe("string");
    expect(result.id.length).toBeGreaterThan(0);

    const node = readNode(repo.repoRoot, "auth")!;
    expect(node.observations).toHaveLength(1);
    expect(node.observations[0].content).toBe("Rate limiting lives in middleware, not here");
    expect(node.observations[0].source).toBeNull();
    expect(node.observations[0].id).toBe(result.id);
  });

  it("appends multiple observations without overwriting", () => {
    handleLearn(repo.repoRoot, { node_name: "auth", content: "First" });
    handleLearn(repo.repoRoot, { node_name: "auth", content: "Second" });

    const node = readNode(repo.repoRoot, "auth")!;
    expect(node.observations).toHaveLength(2);
  });

  it("fails on non-existent node", () => {
    expect(() =>
      handleLearn(repo.repoRoot, { node_name: "nope", content: "something" })
    ).toThrow("Node not found: nope");
  });

  it("stores optional source field", () => {
    handleLearn(repo.repoRoot, {
      node_name: "auth",
      content: "Discovered during debugging",
      source: "session-2024-03-15",
    });

    const node = readNode(repo.repoRoot, "auth")!;
    expect(node.observations[0].source).toBe("session-2024-03-15");
  });

  it("assigns unique ids to observations with distinct content", () => {
    handleLearn(repo.repoRoot, { node_name: "auth", content: "First distinct observation" });
    handleLearn(repo.repoRoot, { node_name: "auth", content: "Second distinct observation" });

    const node = readNode(repo.repoRoot, "auth")!;
    const ids = node.observations.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("produces a file that round-trips through readNode (well-formed frontmatter and body)", () => {
    handleLearn(repo.repoRoot, { node_name: "auth", content: "Multi-line\nobservation content" });
    handleLearn(repo.repoRoot, { node_name: "auth", content: "A second one", source: "src" });

    const raw = readFileSync(nodePath(repo.repoRoot, "auth"), "utf-8");
    // Exactly one blank line separates the frontmatter delimiter from the
    // first bullet -- learn() must not double it up on the first append.
    expect(raw).toContain("---\n\n- Multi-line");
    const node = readNode(repo.repoRoot, "auth")!;
    expect(node.observations).toHaveLength(2);
    expect(node.observations[0].content).toBe("Multi-line\nobservation content");
    expect(node.observations[1].content).toBe("A second one");
    expect(node.observations[1].source).toBe("src");
  });
});
