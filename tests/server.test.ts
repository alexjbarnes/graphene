import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "../src/server.js";
import { createTestGitRepo, createTestGlobalDir, type TestRepo, type TestGlobalDir } from "./helpers.js";

describe("server initialization", () => {
  let repo: TestRepo;
  let global: TestGlobalDir;

  beforeEach(() => {
    repo = createTestGitRepo();
    global = createTestGlobalDir();
  });

  afterEach(() => {
    repo.cleanup();
    global.cleanup();
  });

  it("does not create CLAUDE.md when none exists", () => {
    const server = createServer({ repoRoot: repo.path, globalDir: global.dir });
    const claudeMdPath = join(repo.path, "CLAUDE.md");

    expect(existsSync(claudeMdPath)).toBe(false);
    server.oninitialized!();

    expect(existsSync(claudeMdPath)).toBe(false);
  });

  it("strips a previously committed graphene block, preserving user content", () => {
    const claudeMdPath = join(repo.path, "CLAUDE.md");
    writeFileSync(
      claudeMdPath,
      "# My Project\n\nCustom rules here.\n\n<!-- graphene -->\n## Graphene Context Graph\nold rules\n<!-- /graphene -->\n\n## My Section\n\nKeep this.\n"
    );

    const server = createServer({ repoRoot: repo.path, globalDir: global.dir });
    server.oninitialized!();

    const content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("# My Project");
    expect(content).toContain("Custom rules here.");
    expect(content).toContain("## My Section");
    expect(content).toContain("Keep this.");
    expect(content).not.toContain("Graphene Context Graph");
    expect(content).not.toContain("<!-- graphene -->");
  });

  it("deletes CLAUDE.md when the block was its only content", () => {
    const claudeMdPath = join(repo.path, "CLAUDE.md");
    writeFileSync(claudeMdPath, "<!-- graphene -->\n## Graphene Context Graph\nold rules\n<!-- /graphene -->\n");

    const server = createServer({ repoRoot: repo.path, globalDir: global.dir });
    server.oninitialized!();

    expect(existsSync(claudeMdPath)).toBe(false);
  });

  it("strips a legacy block with no end marker", () => {
    const claudeMdPath = join(repo.path, "CLAUDE.md");
    writeFileSync(claudeMdPath, "# Project\n\n<!-- graphene -->\n## Graphene Context Graph\nruns to end of file\n");

    const server = createServer({ repoRoot: repo.path, globalDir: global.dir });
    server.oninitialized!();

    const content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toBe("# Project\n");
    expect(content).not.toContain("graphene");
  });

  it("leaves CLAUDE.md untouched when it has no graphene block", () => {
    const claudeMdPath = join(repo.path, "CLAUDE.md");
    const original = "# My Project\n\nJust my own rules.\n";
    writeFileSync(claudeMdPath, original);

    const server = createServer({ repoRoot: repo.path, globalDir: global.dir });
    server.oninitialized!();

    expect(readFileSync(claudeMdPath, "utf-8")).toBe(original);
  });

  it("is idempotent across multiple calls", () => {
    const claudeMdPath = join(repo.path, "CLAUDE.md");
    writeFileSync(claudeMdPath, "# Project\n\n<!-- graphene -->\n## Graphene Context Graph\nold\n<!-- /graphene -->\n");

    const server = createServer({ repoRoot: repo.path, globalDir: global.dir });
    server.oninitialized!();
    const first = readFileSync(claudeMdPath, "utf-8");

    server.oninitialized!();
    const second = readFileSync(claudeMdPath, "utf-8");

    expect(second).toBe(first);
    expect(first).toBe("# Project\n");
  });

  it("does not touch CLAUDE.md when there is no repo root", () => {
    const server = createServer({ repoRoot: null, globalDir: global.dir });
    expect(() => server.oninitialized!()).not.toThrow();
  });
});
