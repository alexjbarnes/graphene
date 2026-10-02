import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestRepo, type TestRepoDir } from "../helpers.js";
import { handleRead } from "../../src/tools/read.js";
import { handleUpsertNode } from "../../src/tools/upsert-node.js";
import { handleLink } from "../../src/tools/link.js";
import { handleLearn } from "../../src/tools/learn.js";

describe("read", () => {
  let repo: TestRepoDir;

  beforeEach(() => {
    repo = createTestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe("index (no name)", () => {
    it("returns empty array when no nodes exist", () => {
      const result = handleRead(repo.repoRoot, {});
      expect(result).toEqual({ nodes: [] });
    });

    it("returns all nodes sorted by name", () => {
      handleUpsertNode(repo.repoRoot, { name: "zebra", type: "module" });
      handleUpsertNode(repo.repoRoot, { name: "alpha", type: "subsystem", summary: "First" });

      const result = handleRead(repo.repoRoot, {}) as { nodes: Array<{ name: string }> };
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].name).toBe("alpha");
      expect(result.nodes[1].name).toBe("zebra");
    });
  });

  describe("single node", () => {
    it("returns full node data", () => {
      handleUpsertNode(repo.repoRoot, {
        name: "auth",
        type: "subsystem",
        summary: "Auth system",
        entry_points: ["auth/router.ts"],
        covers: ["auth/"],
        last_commit: "abc",
        metadata: { key: "val" },
      });

      const result = handleRead(repo.repoRoot, { name: "auth" }) as Record<string, unknown>;
      expect(result.name).toBe("auth");
      expect(result.type).toBe("subsystem");
      expect(result.summary).toBe("Auth system");
      expect(result.entry_points).toEqual(["auth/router.ts"]);
      expect(result.covers).toEqual(["auth/"]);
      expect(result.last_commit).toBe("abc");
      expect(result.metadata).toEqual({ key: "val" });
      expect(result.observations).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.dependents).toEqual([]);
    });

    it("throws for non-existent node", () => {
      expect(() => handleRead(repo.repoRoot, { name: "nope" })).toThrow("Node not found");
    });

    it("includes edges with neighbor summaries", () => {
      handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem", summary: "Auth" });
      handleUpsertNode(repo.repoRoot, { name: "db", type: "module", summary: "Database layer" });
      handleLink(repo.repoRoot, { from: "auth", to: "db", type: "depends_on", reason: "stores creds" });

      const result = handleRead(repo.repoRoot, { name: "auth" }) as Record<string, unknown>;
      const edges = result.edges as Array<Record<string, unknown>>;
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({
        node: "db",
        type: "depends_on",
        reason: "stores creds",
        summary: "Database layer",
      });
    });

    it("includes observations in file order, with string ids and no created_at", () => {
      handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });

      handleLearn(repo.repoRoot, { node_name: "auth", content: "First observation" });
      handleLearn(repo.repoRoot, {
        node_name: "auth",
        content: "Second observation",
        source: "debugging",
      });

      const result = handleRead(repo.repoRoot, { name: "auth" }) as Record<string, unknown>;
      const obs = result.observations as Array<Record<string, unknown>>;
      expect(obs).toHaveLength(2);
      expect(obs[0].content).toBe("First observation");
      expect(obs[1].content).toBe("Second observation");
      expect(obs[1].source).toBe("debugging");
      expect(obs[0].source).toBeNull();
      expect(typeof obs[0].id).toBe("string");
      expect(obs[0]).not.toHaveProperty("created_at");
    });

    it("includes incoming edges as dependents", () => {
      handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem", summary: "Auth" });
      handleUpsertNode(repo.repoRoot, { name: "api", type: "subsystem", summary: "API layer" });
      handleUpsertNode(repo.repoRoot, { name: "ws", type: "subsystem", summary: "WebSocket" });

      handleLink(repo.repoRoot, {
        from: "api",
        to: "auth",
        type: "depends_on",
        reason: "uses auth middleware",
      });
      handleLink(repo.repoRoot, {
        from: "ws",
        to: "auth",
        type: "depends_on",
        reason: "validates connections",
      });

      const result = handleRead(repo.repoRoot, { name: "auth" }) as Record<string, unknown>;
      const dependents = result.dependents as Array<Record<string, unknown>>;
      expect(dependents).toHaveLength(2);
      expect(dependents.map((d) => d.node)).toContain("api");
      expect(dependents.map((d) => d.node)).toContain("ws");
    });

    it("includes observation ids matching what learn() returned", () => {
      handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
      const { id } = handleLearn(repo.repoRoot, { node_name: "auth", content: "Test observation" });

      const result = handleRead(repo.repoRoot, { name: "auth" }) as Record<string, unknown>;
      const obs = result.observations as Array<Record<string, unknown>>;
      expect(obs[0].id).toBe(id);
    });
  });

  describe("read budget", () => {
    it("returns every observation in full while the node is within budget", () => {
      handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
      handleLearn(repo.repoRoot, { node_name: "auth", content: "a".repeat(10_000) });
      handleLearn(repo.repoRoot, { node_name: "auth", content: "b".repeat(10_000) });

      const result = handleRead(repo.repoRoot, { name: "auth" }) as Record<string, unknown>;
      const obs = result.observations as Array<Record<string, unknown>>;
      expect(result).not.toHaveProperty("observations_note");
      expect(obs.map((o) => (o.content as string).length)).toEqual([10_000, 10_000]);
      expect(obs[0]).not.toHaveProperty("truncated");
    });

    it("cuts long observations to previews once the node is over budget, leaving short ones whole", () => {
      handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
      const long = handleLearn(repo.repoRoot, { node_name: "auth", content: "a".repeat(15_000) });
      handleLearn(repo.repoRoot, { node_name: "auth", content: "b".repeat(6_000), source: "debugging" });
      handleLearn(repo.repoRoot, { node_name: "auth", content: "short and whole" });

      const result = handleRead(repo.repoRoot, { name: "auth" }) as Record<string, unknown>;
      const obs = result.observations as Array<Record<string, unknown>>;
      expect(obs).toHaveLength(3);
      expect(obs[0]).toEqual({ id: long.id, content: "a".repeat(200) + "...", source: null, truncated: true });
      expect(obs[1].source).toBe("debugging");
      expect(obs[1].truncated).toBe(true);
      expect(obs[2]).not.toHaveProperty("truncated");
      expect(obs[2].content).toBe("short and whole");

      const note = result.observations_note as string;
      expect(note).toContain("3 observations total 21015 characters");
      expect(note).toContain("read(name, id)");
      expect(note).toContain("split it into nodes by topic");
    });

    it("lists the note ahead of the observations it explains", () => {
      handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
      handleLearn(repo.repoRoot, { node_name: "auth", content: "a".repeat(20_001) });

      const keys = Object.keys(handleRead(repo.repoRoot, { name: "auth" }));
      expect(keys.indexOf("observations_note")).toBe(keys.indexOf("observations") - 1);
    });
  });

  describe("single observation (name + id)", () => {
    it("returns one observation in full, even from a node over the read budget", () => {
      handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
      const content = "c".repeat(25_000);
      const { id } = handleLearn(repo.repoRoot, { node_name: "auth", content, source: "incident" });
      handleLearn(repo.repoRoot, { node_name: "auth", content: "unrelated" });

      const result = handleRead(repo.repoRoot, { name: "auth", id });
      expect(result).toEqual({ name: "auth", observation: { id, content, source: "incident" } });
    });

    it("throws for an id the node does not have", () => {
      handleUpsertNode(repo.repoRoot, { name: "auth", type: "subsystem" });
      handleLearn(repo.repoRoot, { node_name: "auth", content: "Test observation" });

      expect(() => handleRead(repo.repoRoot, { name: "auth", id: "ffff" })).toThrow(
        "Observation not found: ffff in node auth"
      );
    });

    it("throws for an id without a name rather than returning the index", () => {
      expect(() => handleRead(repo.repoRoot, { id: "ffff" })).toThrow("name is required with id");
    });
  });
});
