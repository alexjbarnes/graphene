// Drives the routing layer (server.ts's exported `dispatch`) directly,
// without stdio -- the wire itself is covered by the multi-repo case in
// e2e.test.ts. Every test here builds a temp parent directory containing two
// child git repos so scopes.length > 1 and the multi-repo dispatch path
// (dispatchMulti in server.ts) is what actually runs.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dispatch, type ServerContext } from "../src/server.js";
import { discoverScopes } from "../src/scope.js";
import { readNode } from "../src/store.js";
import { createTestGitRepo, createTestGlobalDir, type TestRepo, type TestGlobalDir } from "./helpers.js";

describe("multi-repo dispatch", () => {
  let parent: string;
  let portal: TestRepo;
  let worker: TestRepo;
  let global: TestGlobalDir;
  let ctx: ServerContext;
  let originalCwd: string;

  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), "graphene-multi-"));
    portal = createTestGitRepo(parent, "portal");
    worker = createTestGitRepo(parent, "worker");
    global = createTestGlobalDir();
    originalCwd = process.cwd();
    ctx = { scopes: discoverScopes(parent), globalDir: global.dir };
  });

  afterEach(() => {
    process.chdir(originalCwd);
    portal.cleanup();
    worker.cleanup();
    global.cleanup();
    rmSync(parent, { recursive: true, force: true });
  });

  it("discovers both repos as scopes, sorted by name", () => {
    expect(ctx.scopes.map((s) => s.name)).toEqual(["portal", "worker"]);
  });

  it("aggregates the read index across repos with repo fields, sorted repo then name", () => {
    dispatch(ctx, "upsert_node", { name: "portal:zeta", type: "subsystem" });
    dispatch(ctx, "upsert_node", { name: "portal:alpha", type: "subsystem" });
    dispatch(ctx, "upsert_node", { name: "worker:beta", type: "subsystem" });

    const result = dispatch(ctx, "read", {}) as { nodes: Array<Record<string, unknown>> };
    expect(result.nodes).toEqual([
      { repo: "portal", name: "alpha", type: "subsystem", summary: null },
      { repo: "portal", name: "zeta", type: "subsystem", summary: null },
      { repo: "worker", name: "beta", type: "subsystem", summary: null },
    ]);
  });

  it("reads a qualified node and a bare-unique node, and throws on bare-ambiguous", () => {
    dispatch(ctx, "upsert_node", { name: "portal:auth", type: "subsystem", summary: "Portal auth" });
    dispatch(ctx, "upsert_node", { name: "worker:queue", type: "subsystem", summary: "Job queue" });

    const qualified = dispatch(ctx, "read", { name: "portal:auth" }) as { repo: string; name: string };
    expect(qualified.repo).toBe("portal");
    expect(qualified.name).toBe("auth");

    const bareUnique = dispatch(ctx, "read", { name: "queue" }) as { repo: string; name: string };
    expect(bareUnique.repo).toBe("worker");
    expect(bareUnique.name).toBe("queue");

    dispatch(ctx, "upsert_node", { name: "worker:auth", type: "subsystem" });
    expect(() => dispatch(ctx, "read", { name: "auth" })).toThrow(
      'Ambiguous node "auth": found in portal:auth, worker:auth. Qualify with repo:name.'
    );
  });

  it("routes a create by cwd-relative covers and rewrites them repo-relative in the stored file", () => {
    process.chdir(parent);
    dispatch(ctx, "upsert_node", {
      name: "newthing",
      type: "subsystem",
      covers: ["portal/src/x.ts"],
      entry_points: ["portal/src/x.ts"],
    });

    const node = readNode(portal.path, "newthing");
    expect(node).not.toBeNull();
    expect(node!.covers).toEqual(["src/x.ts"]);
    expect(node!.entry_points).toEqual(["src/x.ts"]);
    expect(readNode(worker.path, "newthing")).toBeNull();
  });

  it("throws the structured ambiguous-create error when a new node's scope cannot be inferred", () => {
    process.chdir(parent);
    expect(() => dispatch(ctx, "upsert_node", { name: "orphan", type: "subsystem" })).toThrow(
      'Cannot determine the owning repo for new node "orphan". In scope: portal, worker. ' +
        "Qualify the name (repo:name) or give covers/entry_points paths inside one repo."
    );
  });

  it("learn on a qualified name lands in the right repo's file", () => {
    dispatch(ctx, "upsert_node", { name: "portal:auth", type: "subsystem" });

    const result = dispatch(ctx, "learn", { node_name: "portal:auth", content: "Uses JWT" }) as {
      id: string;
      node_name: string;
    };
    expect(result.node_name).toBe("auth");

    const portalAuth = readNode(portal.path, "auth");
    expect(portalAuth!.observations).toHaveLength(1);
    expect(portalAuth!.observations[0].content).toBe("Uses JWT");
    expect(readNode(worker.path, "auth")).toBeNull();
  });

  it("rejects a cross-repo link with the exact error", () => {
    dispatch(ctx, "upsert_node", { name: "portal:auth", type: "subsystem" });
    dispatch(ctx, "upsert_node", { name: "worker:queue", type: "subsystem" });

    expect(() =>
      dispatch(ctx, "link", { from: "portal:auth", to: "worker:queue", type: "depends_on" })
    ).toThrow('Cross-repo edges are not supported: "portal:auth" is in portal, "worker:queue" is in worker.');
  });

  it("rejects a cross-repo unlink the same way", () => {
    dispatch(ctx, "upsert_node", { name: "portal:auth", type: "subsystem" });
    dispatch(ctx, "upsert_node", { name: "worker:queue", type: "subsystem" });

    expect(() => dispatch(ctx, "unlink", { from: "portal:auth", to: "worker:queue" })).toThrow(
      'Cross-repo edges are not supported: "portal:auth" is in portal, "worker:queue" is in worker.'
    );
  });

  it("requires a repo argument for project_write in a multi-repo session, and accepts a valid one", () => {
    expect(() =>
      dispatch(ctx, "project_write", { category: "convention", subject: "x", content: "y" })
    ).toThrow('project_write requires a "repo" argument in a multi-repo session. In scope: portal, worker.');

    expect(() =>
      dispatch(ctx, "project_write", { category: "convention", subject: "x", content: "y", repo: "nope" })
    ).toThrow('Unknown repo "nope" for project_write. In scope: portal, worker.');

    const result = dispatch(ctx, "project_write", {
      category: "convention",
      subject: "x",
      content: "y",
      repo: "portal",
    });
    expect(result).toEqual({ category: "convention", subject: "x" });
  });

  it("groups batch items by scope, and a resolution error anywhere writes nothing anywhere", () => {
    expect(() =>
      dispatch(ctx, "batch", {
        nodes: [
          { name: "portal:auth", type: "subsystem" },
          { name: "worker:queue", type: "subsystem" },
        ],
        edges: [{ from: "portal:auth", to: "worker:queue", type: "depends_on" }],
      })
    ).toThrow(/Cross-repo edges are not supported/);

    const index = dispatch(ctx, "read", {}) as { nodes: unknown[] };
    expect(index.nodes).toHaveLength(0);
  });

  it("batch groups node/edge/observation items by their resolved scope and writes each once", () => {
    const result = dispatch(ctx, "batch", {
      nodes: [
        { name: "portal:auth", type: "subsystem", summary: "Auth" },
        { name: "worker:queue", type: "subsystem", summary: "Queue" },
      ],
      edges: [{ from: "portal:auth", to: "portal:auth", type: "related_to" }],
      observations: [{ node_name: "worker:queue", content: "FIFO" }],
    }) as { nodes_created: number; edges_created: number; observations_added: number };

    expect(result.nodes_created).toBe(2);
    expect(result.edges_created).toBe(1);
    expect(result.observations_added).toBe(1);

    const portalAuth = readNode(portal.path, "auth");
    expect(portalAuth!.edges).toEqual([{ to: "auth", type: "related_to", reason: null }]);
    const workerQueue = readNode(worker.path, "queue");
    expect(workerQueue!.observations).toHaveLength(1);
    expect(workerQueue!.observations[0].content).toBe("FIFO");
  });

  it("folds two batch node entries with the same bare name onto one scope instead of resolving them independently", () => {
    process.chdir(parent);
    const result = dispatch(ctx, "batch", {
      nodes: [
        { name: "fresh", type: "subsystem", covers: ["portal/src/f.ts"] },
        // No covers this time: without the fix, a second independent
        // resolveWriteTarget call here would find zero votes and throw.
        { name: "fresh", summary: "filled in later" },
      ],
    }) as { nodes_created: number; nodes_updated: number };

    expect(result.nodes_created).toBe(1);
    expect(result.nodes_updated).toBe(1);

    const node = readNode(portal.path, "fresh");
    expect(node).not.toBeNull();
    expect(node!.summary).toBe("filled in later");
    expect(readNode(worker.path, "fresh")).toBeNull();
  });

  it("routes a same-batch node create by cwd-relative covers so a sibling edge/observation can reference it", () => {
    process.chdir(parent);
    const result = dispatch(ctx, "batch", {
      nodes: [{ name: "fresh", type: "subsystem", covers: ["worker/src/f.ts"] }],
      observations: [{ node_name: "fresh", content: "seen at create time" }],
    }) as { nodes_created: number; observations_added: number };

    expect(result.nodes_created).toBe(1);
    expect(result.observations_added).toBe(1);

    const node = readNode(worker.path, "fresh");
    expect(node).not.toBeNull();
    expect(node!.covers).toEqual(["src/f.ts"]);
    expect(node!.observations).toHaveLength(1);
  });

  it("multi-repo status returns a repos array plus global_facts computed exactly once", () => {
    dispatch(ctx, "global_write", { category: "preference", subject: "testing", content: "TDD" });
    dispatch(ctx, "upsert_node", { name: "portal:auth", type: "subsystem" });

    const status = dispatch(ctx, "status", {}) as {
      repos: Array<{ repo: string; nodes: unknown[] }>;
      global_facts: { count: number; keys: string[] };
    };
    expect(status.repos.map((r) => r.repo)).toEqual(["portal", "worker"]);
    expect(status.repos[0].nodes).toHaveLength(1);
    expect(status.repos[1].nodes).toHaveLength(0);
    expect(status.global_facts).toEqual({ count: 1, keys: ["preference/testing"] });
    expect(status.repos[0]).not.toHaveProperty("global_facts");
  });

  it("multi-repo stale returns a repos array", () => {
    dispatch(ctx, "upsert_node", { name: "portal:auth", type: "subsystem", covers: ["src/"] });

    const stale = dispatch(ctx, "stale", {}) as {
      repos: Array<{ repo: string; stale_nodes: unknown[]; total_count: number }>;
    };
    expect(stale.repos.map((r) => r.repo)).toEqual(["portal", "worker"]);
    expect(stale.repos[0].total_count).toBe(1);
    expect(stale.repos[0].stale_nodes).toHaveLength(1);
  });

  it("multi-repo search tags results with repo and leaves global facts untagged", () => {
    dispatch(ctx, "upsert_node", { name: "portal:auth", type: "subsystem", summary: "findme in portal" });
    dispatch(ctx, "upsert_node", { name: "worker:queue", type: "subsystem", summary: "findme in worker" });
    dispatch(ctx, "global_write", { category: "preference", subject: "findme", content: "findme global fact" });

    const result = dispatch(ctx, "search", { query: "findme" }) as {
      results: Array<{ repo?: string; node_name: string; type: string }>;
    };
    const byNode = Object.fromEntries(result.results.map((r) => [r.node_name, r]));
    expect(byNode["auth"].repo).toBe("portal");
    expect(byNode["queue"].repo).toBe("worker");
    expect(byNode["preference/findme"].repo).toBeUndefined();
  });
});

describe("single-repo status shape is unchanged (regression guard)", () => {
  let repo: TestRepo;
  let global: TestGlobalDir;
  let ctx: ServerContext;

  beforeEach(() => {
    repo = createTestGitRepo();
    global = createTestGlobalDir();
    ctx = { scopes: discoverScopes(repo.path), globalDir: global.dir };
  });

  afterEach(() => {
    repo.cleanup();
    global.cleanup();
  });

  it("stays a flat object with no repos wrapper", () => {
    dispatch(ctx, "upsert_node", { name: "auth", type: "subsystem" });

    const status = dispatch(ctx, "status", {}) as Record<string, unknown>;
    expect(status).not.toHaveProperty("repos");
    expect(status).toHaveProperty("head");
    expect(status).toHaveProperty("nodes");
    expect(status).toHaveProperty("global_facts");

    const read = dispatch(ctx, "read", {}) as { nodes: Array<Record<string, unknown>> };
    expect(read.nodes[0]).not.toHaveProperty("repo");
  });
});

describe("a broken scope degrades instead of failing the session", () => {
  let parent: string;
  let healthy: TestRepo;
  let globalStore: TestGlobalDir;

  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), "graphene-degrade-"));
    healthy = createTestGitRepo(parent, "healthy");
    globalStore = createTestGlobalDir();
    // A sibling repo with zero commits: getHead throws for it.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    execSync("git init empty-repo", { cwd: parent, stdio: "ignore" });
  });

  afterEach(() => {
    globalStore.cleanup();
    rmSync(parent, { recursive: true, force: true });
  });

  function ctx(): ServerContext {
    return { scopes: discoverScopes(parent), globalDir: globalStore.dir };
  }

  it("status reports the healthy repo and an error entry for the broken one", () => {
    dispatch(ctx(), "upsert_node", { name: "healthy:auth", type: "subsystem" });
    const status = dispatch(ctx(), "status", {}) as {
      repos: Array<{ repo: string; head?: string; error?: string }>;
    };
    expect(status.repos).toHaveLength(2);
    const ok = status.repos.find((r) => r.repo === "healthy");
    const broken = status.repos.find((r) => r.repo === "empty-repo");
    expect(ok?.head).toMatch(/^[0-9a-f]{40}$/);
    expect(ok).not.toHaveProperty("error");
    expect(broken?.error).toBeTruthy();
    expect(broken).not.toHaveProperty("head");
  });

  it("stale succeeds for a zero-commit repo (it never reads HEAD)", () => {
    const stale = dispatch(ctx(), "stale", {}) as {
      repos: Array<{ repo: string; error?: string; total_count?: number }>;
    };
    const ok = stale.repos.find((r) => r.repo === "healthy");
    const broken = stale.repos.find((r) => r.repo === "empty-repo");
    expect(ok?.total_count).toBe(0);
    expect(broken?.total_count).toBe(0);
    expect(broken).not.toHaveProperty("error");
  });
});
