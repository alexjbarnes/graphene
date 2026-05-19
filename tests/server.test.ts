import { describe, it, expect, beforeEach, beforeAll, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initSql, openMemoryDatabase, initRepoSchema, initGlobalSchema, type GrapheneDatabase } from "../src/db.js";
import { createServer } from "../src/server.js";
import { createTestGitRepo, type TestRepo } from "./helpers.js";

beforeAll(async () => {
  await initSql();
});

describe("server initialization", () => {
  let repoDB: GrapheneDatabase;
  let globalDB: GrapheneDatabase;
  let repo: TestRepo;

  beforeEach(() => {
    repoDB = openMemoryDatabase();
    initRepoSchema(repoDB);
    globalDB = openMemoryDatabase();
    initGlobalSchema(globalDB);
    repo = createTestGitRepo();
  });

  afterEach(() => {
    repoDB.close();
    globalDB.close();
    repo.cleanup();
  });

  it("creates CLAUDE.md on initialized", () => {
    const server = createServer({ repoDB, globalDB, repoRoot: repo.path });
    const claudeMdPath = join(repo.path, "CLAUDE.md");

    expect(existsSync(claudeMdPath)).toBe(false);
    server.oninitialized!();

    expect(existsSync(claudeMdPath)).toBe(true);
    const content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("Graphene Context Graph");
    expect(content).toContain("<!-- graphene -->");
  });

  it("appends to existing CLAUDE.md without graphene section", () => {
    const claudeMdPath = join(repo.path, "CLAUDE.md");
    writeFileSync(claudeMdPath, "# My Project\n\nExisting content.\n");

    const server = createServer({ repoDB, globalDB, repoRoot: repo.path });
    server.oninitialized!();

    const content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("# My Project");
    expect(content).toContain("Graphene Context Graph");
  });

  it("replaces graphene section between both markers", () => {
    const claudeMdPath = join(repo.path, "CLAUDE.md");
    writeFileSync(claudeMdPath, "# Project\n<!-- graphene -->\n## Old Graphene Stuff\n<!-- /graphene -->\n");

    const server = createServer({ repoDB, globalDB, repoRoot: repo.path });
    server.oninitialized!();

    const content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("# Project\n");
    expect(content).toContain("Graphene Context Graph");
    expect(content).not.toContain("Old Graphene Stuff");
  });

  it("replaces legacy install without end marker", () => {
    const claudeMdPath = join(repo.path, "CLAUDE.md");
    writeFileSync(claudeMdPath, "# Project\n<!-- graphene -->\n## Old Content\n");

    const server = createServer({ repoDB, globalDB, repoRoot: repo.path });
    server.oninitialized!();

    const content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("# Project\n");
    expect(content).toContain("Graphene Context Graph");
    expect(content).toContain("<!-- /graphene -->");
    expect(content).not.toContain("## Old Content");
  });

  it("preserves user content before graphene section", () => {
    const claudeMdPath = join(repo.path, "CLAUDE.md");
    writeFileSync(claudeMdPath, "# My Project\n\nCustom rules here.\n\n<!-- graphene -->\n## Old\n<!-- /graphene -->\n");

    const server = createServer({ repoDB, globalDB, repoRoot: repo.path });
    server.oninitialized!();

    const content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("# My Project");
    expect(content).toContain("Custom rules here.");
    expect(content).toContain("Graphene Context Graph");
    expect(content).not.toContain("## Old");
  });

  it("preserves user content after graphene section", () => {
    const claudeMdPath = join(repo.path, "CLAUDE.md");
    writeFileSync(claudeMdPath, "# Project\n<!-- graphene -->\n## Old\n<!-- /graphene -->\n\n## My Custom Section\n\nDo not delete this.\n");

    const server = createServer({ repoDB, globalDB, repoRoot: repo.path });
    server.oninitialized!();

    const content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("Graphene Context Graph");
    expect(content).toContain("## My Custom Section");
    expect(content).toContain("Do not delete this.");
    expect(content).not.toContain("## Old");
  });

  it("is idempotent across multiple calls", () => {
    const server = createServer({ repoDB, globalDB, repoRoot: repo.path });
    server.oninitialized!();
    const first = readFileSync(join(repo.path, "CLAUDE.md"), "utf-8");

    server.oninitialized!();
    const second = readFileSync(join(repo.path, "CLAUDE.md"), "utf-8");

    expect(second).toBe(first);
  });
});
