import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import {
  discoverScopes,
  parseNodeRef,
  resolveNodeRef,
  resolveUpsertRef,
  resolveWriteTarget,
  rewriteRepoRelative,
  type RepoScope,
} from "../src/scope.js";
import { writeNode, type StoredNode } from "../src/store.js";
import { createTestGitRepo, createTestRepo, type TestRepo, type TestRepoDir } from "./helpers.js";

function makeNode(name: string): StoredNode {
  return {
    name,
    type: "subsystem",
    summary: null,
    entry_points: [],
    covers: [],
    last_commit: null,
    metadata: {},
    edges: [],
    observations: [],
  };
}

function initGitDir(path: string): void {
  mkdirSync(path, { recursive: true });
  execSync("git init", { cwd: path, stdio: "ignore" });
  execSync("git config user.email test@test.com", { cwd: path, stdio: "ignore" });
  execSync("git config user.name Test", { cwd: path, stdio: "ignore" });
  execSync("git commit --allow-empty -m init", { cwd: path, stdio: "ignore" });
}

describe("discoverScopes", () => {
  let repo: TestRepo;
  let parent: string;

  afterEach(() => {
    repo?.cleanup();
    if (parent) rmSync(parent, { recursive: true, force: true });
  });

  it("returns a single scope named after the repo's basename when cwd is inside a repo", () => {
    repo = createTestGitRepo();
    const scopes = discoverScopes(repo.path);
    expect(scopes).toEqual([{ name: basename(repo.path), root: repo.path }]);
  });

  it("resolves to the repo root's basename even when cwd is a subdirectory of the repo", () => {
    repo = createTestGitRepo();
    const subdir = join(repo.path, "src", "nested");
    mkdirSync(subdir, { recursive: true });

    const scopes = discoverScopes(subdir);
    expect(scopes).toEqual([{ name: basename(repo.path), root: repo.path }]);
  });

  it("returns empty when cwd is not in a repo and has no child repos", () => {
    parent = mkdtempSync(join(tmpdir(), "graphene-scope-test-"));
    mkdirSync(join(parent, "plain-dir"));
    writeFileSync(join(parent, "file.txt"), "hi");

    expect(discoverScopes(parent)).toEqual([]);
  });

  it("discovers two child repos, sorted by name", () => {
    parent = mkdtempSync(join(tmpdir(), "graphene-scope-test-"));
    initGitDir(join(parent, "worker"));
    initGitDir(join(parent, "portal"));

    const scopes = discoverScopes(parent);
    expect(scopes).toEqual([
      { name: "portal", root: join(parent, "portal") },
      { name: "worker", root: join(parent, "worker") },
    ]);
  });

  it("skips node_modules, vendor, dist, build, target, .cache, tmp, and dot-directories", () => {
    parent = mkdtempSync(join(tmpdir(), "graphene-scope-test-"));
    initGitDir(join(parent, "real"));
    for (const skipped of ["node_modules", "vendor", "dist", "build", "target", ".cache", "tmp", ".hidden"]) {
      initGitDir(join(parent, skipped, "nested-repo"));
    }

    const scopes = discoverScopes(parent);
    expect(scopes).toEqual([{ name: "real", root: join(parent, "real") }]);
  });

  it("finds repos up to 2 directories below cwd but not deeper", () => {
    parent = mkdtempSync(join(tmpdir(), "graphene-scope-test-"));
    initGitDir(join(parent, "group", "worker")); // depth 2: found
    initGitDir(join(parent, "group2", "sub", "deep")); // depth 3: not found

    const scopes = discoverScopes(parent);
    expect(scopes).toEqual([{ name: join("group", "worker"), root: join(parent, "group", "worker") }]);
  });

  it("does not descend into a discovered repo to look for nested repos", () => {
    parent = mkdtempSync(join(tmpdir(), "graphene-scope-test-"));
    initGitDir(join(parent, "outer"));
    initGitDir(join(parent, "outer", "inner"));

    const scopes = discoverScopes(parent);
    expect(scopes).toEqual([{ name: "outer", root: join(parent, "outer") }]);
  });

  it("throws when more than 20 repos are found, naming the cap", () => {
    parent = mkdtempSync(join(tmpdir(), "graphene-scope-test-"));
    for (let i = 0; i < 21; i++) {
      initGitDir(join(parent, `repo-${String(i).padStart(2, "0")}`));
    }

    expect(() => discoverScopes(parent)).toThrow(/21 repos/);
    expect(() => discoverScopes(parent)).toThrow(/too broad/);
  }, 30000);
});

describe("parseNodeRef / resolveNodeRef", () => {
  let portalDir: TestRepoDir;
  let workerDir: TestRepoDir;
  let scopes: RepoScope[];

  function setup(): void {
    portalDir = createTestRepo();
    workerDir = createTestRepo();
    scopes = [
      { name: "portal", root: portalDir.repoRoot },
      { name: "worker", root: workerDir.repoRoot },
    ];
  }

  afterEach(() => {
    portalDir?.cleanup();
    workerDir?.cleanup();
  });

  it("qualified ref resolves directly to the named scope regardless of existence", () => {
    setup();
    const result = resolveNodeRef("portal:auth", scopes);
    expect(result).toEqual({ scope: scopes[0], name: "auth" });
  });

  it("qualified ref with an unknown repo throws, listing scope names", () => {
    setup();
    expect(() => resolveNodeRef("nope:auth", scopes)).toThrow(
      'Unknown repo "nope". In scope: portal, worker.'
    );
  });

  it("splits on the LAST colon, so a repo name containing a colon still isolates the node name", () => {
    setup();
    // Node names can never actually contain a colon (slugs disallow it), but
    // a scope's name comes from a directory basename, which can. Splitting
    // on the last colon means the repo part absorbs any earlier colons.
    const weird: RepoScope[] = [...scopes, { name: "my:repo", root: workerDir.repoRoot }];
    const result = parseNodeRef("my:repo:auth", weird);
    expect(result).toEqual({ scope: weird[2], name: "auth" });
  });

  it("bare ref unique to one scope resolves to that scope", () => {
    setup();
    writeNode(portalDir.repoRoot, makeNode("auth"));
    const result = resolveNodeRef("auth", scopes);
    expect(result).toEqual({ scope: scopes[0], name: "auth" });
  });

  it("bare ref present in multiple scopes throws, listing qualified refs", () => {
    setup();
    writeNode(portalDir.repoRoot, makeNode("auth"));
    writeNode(workerDir.repoRoot, makeNode("auth"));
    expect(() => resolveNodeRef("auth", scopes)).toThrow(
      'Ambiguous node "auth": found in portal:auth, worker:auth. Qualify with repo:name.'
    );
  });

  it("bare ref present nowhere throws Node not found, naming the search set", () => {
    setup();
    expect(() => resolveNodeRef("ghost", scopes)).toThrow(
      "Node not found: ghost (searched 2 repos: portal, worker)"
    );
  });

  it("bare ref resolves to the single scope when only one scope exists", () => {
    portalDir = createTestRepo();
    const singleScope = [{ name: "portal", root: portalDir.repoRoot }];
    const result = resolveNodeRef("anything", singleScope);
    expect(result).toEqual({ scope: singleScope[0], name: "anything" });
  });
});

describe("resolveUpsertRef", () => {
  let portalDir: TestRepoDir;
  let workerDir: TestRepoDir;
  let scopes: RepoScope[];

  function setup(): void {
    portalDir = createTestRepo();
    workerDir = createTestRepo();
    scopes = [
      { name: "portal", root: portalDir.repoRoot },
      { name: "worker", root: workerDir.repoRoot },
    ];
  }

  afterEach(() => {
    portalDir?.cleanup();
    workerDir?.cleanup();
  });

  it("routes a qualified name directly even if it does not exist yet", () => {
    setup();
    expect(resolveUpsertRef("worker:brandnew", scopes)).toEqual({ scope: scopes[1], name: "brandnew" });
  });

  it("routes a bare name that exists in exactly one scope", () => {
    setup();
    writeNode(workerDir.repoRoot, makeNode("auth"));
    expect(resolveUpsertRef("auth", scopes)).toEqual({ scope: scopes[1], name: "auth" });
  });

  it("throws ambiguous for a bare name that exists in more than one scope", () => {
    setup();
    writeNode(portalDir.repoRoot, makeNode("auth"));
    writeNode(workerDir.repoRoot, makeNode("auth"));
    expect(() => resolveUpsertRef("auth", scopes)).toThrow(/Ambiguous node "auth"/);
  });

  it("returns just the bare name (no scope) when nothing exists anywhere", () => {
    setup();
    expect(resolveUpsertRef("brandnew", scopes)).toEqual({ name: "brandnew" });
  });
});

describe("resolveWriteTarget / rewriteRepoRelative", () => {
  let parent: string;
  let scopes: RepoScope[];

  function setupTwoScopes(): void {
    parent = mkdtempSync(join(tmpdir(), "graphene-write-target-"));
    mkdirSync(join(parent, "portal", "src"), { recursive: true });
    mkdirSync(join(parent, "worker", "src"), { recursive: true });
    scopes = [
      { name: "portal", root: join(parent, "portal") },
      { name: "worker", root: join(parent, "worker") },
    ];
  }

  afterEach(() => {
    if (parent) rmSync(parent, { recursive: true, force: true });
  });

  it("qualified name resolves directly, ignoring paths entirely", () => {
    setupTwoScopes();
    const scope = resolveWriteTarget(scopes, "portal:newthing", parent, []);
    expect(scope).toEqual(scopes[0]);
  });

  it("single scope always wins, regardless of paths", () => {
    parent = mkdtempSync(join(tmpdir(), "graphene-write-target-"));
    const single = [{ name: "portal", root: join(parent, "portal") }];
    mkdirSync(single[0].root, { recursive: true });
    expect(resolveWriteTarget(single, "newthing", parent, ["nonexistent/path.ts"])).toEqual(single[0]);
  });

  it("resolves via a cwd-relative path that falls inside one scope's root", () => {
    setupTwoScopes();
    const scope = resolveWriteTarget(scopes, "newthing", parent, ["portal/src/x.ts"]);
    expect(scope).toEqual(scopes[0]);
  });

  it("resolves via an already repo-relative path that exists on disk in one scope", () => {
    setupTwoScopes();
    writeFileSync(join(parent, "portal", "src", "y.ts"), "// hi");
    const scope = resolveWriteTarget(scopes, "newthing", parent, ["src/y.ts"]);
    expect(scope).toEqual(scopes[0]);
  });

  it("throws a structured error when paths give zero or conflicting resolution", () => {
    setupTwoScopes();
    expect(() => resolveWriteTarget(scopes, "newthing", parent, [])).toThrow(
      'Cannot determine the owning repo for new node "newthing". In scope: portal, worker. ' +
        "Qualify the name (repo:name) or give covers/entry_points paths inside one repo."
    );

    writeFileSync(join(parent, "portal", "src", "shared.ts"), "// a");
    writeFileSync(join(parent, "worker", "src", "shared.ts"), "// b");
    expect(() => resolveWriteTarget(scopes, "newthing", parent, ["src/shared.ts"])).toThrow(
      /Cannot determine the owning repo/
    );
  });

  it("rewrites a cwd-relative path to repo-relative for the resolved scope", () => {
    setupTwoScopes();
    const scope = resolveWriteTarget(scopes, "newthing", parent, ["portal/src/x.ts"]);
    const rewritten = rewriteRepoRelative(scope, parent, ["portal/src/x.ts"]);
    expect(rewritten).toEqual(["src/x.ts"]);
  });

  it("leaves an already repo-relative path unchanged on rewrite", () => {
    setupTwoScopes();
    const rewritten = rewriteRepoRelative(scopes[0], parent, ["src/y.ts"]);
    expect(rewritten).toEqual(["src/y.ts"]);
  });
});
