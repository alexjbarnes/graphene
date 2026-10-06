import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { readNode, nodePath } from "../../src/store.js";
import { createTestRepo, seedObservations, type TestRepoDir } from "../helpers.js";
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

  describe("size limits", () => {
    function fileText(): string {
      return readFileSync(nodePath(repo.repoRoot, "auth"), "utf-8");
    }

    it("accepts an observation of exactly 1,500 characters", () => {
      const { id } = handleLearn(repo.repoRoot, { node_name: "auth", content: "a".repeat(1_500) });
      expect(readNode(repo.repoRoot, "auth")!.observations.map((o) => o.id)).toEqual([id]);
    });

    it("refuses an observation over 1,500 characters and leaves the node file untouched", () => {
      const before = fileText();
      expect(() => handleLearn(repo.repoRoot, { node_name: "auth", content: "a".repeat(1_501) })).toThrow(
        'Observation for node "auth" is 1501 characters, over the 1500-character limit'
      );
      expect(fileText()).toBe(before);
    });

    it("fills a node to exactly the read budget, then refuses the next observation", () => {
      for (let i = 0; i < 16; i++) {
        handleLearn(repo.repoRoot, { node_name: "auth", content: `${i}`.padEnd(1_250, "x") });
      }
      const before = fileText();

      expect(() => handleLearn(repo.repoRoot, { node_name: "auth", content: "one more" })).toThrow(
        'Node "auth" holds 20000 characters of observations; adding 8 more would take it past the ' +
          "20000-character read budget. Make room, then record this"
      );
      expect(fileText()).toBe(before);
    });

    it("lists the node's five largest observations, largest first, in the refusal", () => {
      const sizes = [900, 1_500, 300, 1_400, 1_200, 1_100, 1_000];
      const ids = sizes.map(
        (n, i) => handleLearn(repo.repoRoot, { node_name: "auth", content: `${i}`.padEnd(n, "x") }).id
      );
      for (let i = 0; i < 9; i++) {
        handleLearn(repo.repoRoot, { node_name: "auth", content: `filler ${i}`.padEnd(1_400, "y") });
      }

      let message = "";
      try {
        handleLearn(repo.repoRoot, { node_name: "auth", content: "z".repeat(1_000) });
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain("remove_observation(node, id)");
      expect(message).toContain("split the node by topic");
      const listed = message.slice(message.indexOf("Largest observations: "));
      expect(listed).toContain(`${ids[1]} (1500 chars) "1xxx`);
      expect(listed).toContain(`${ids[3]} (1400 chars)`);
      expect(listed.split("; ")).toHaveLength(5);
      expect(listed).not.toContain(`${ids[2]} (300 chars)`);
    });

    it("refuses any observation on a node already over the budget", () => {
      seedObservations(repo.repoRoot, "auth", [{ content: "a".repeat(25_000) }]);
      expect(() => handleLearn(repo.repoRoot, { node_name: "auth", content: "tiny" })).toThrow(
        'Node "auth" holds 25000 characters of observations; adding 4 more'
      );
    });
  });
});
