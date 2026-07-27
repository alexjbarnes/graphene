// End-to-end coverage against the compiled server (dist/index.js), driven
// over real MCP stdio via the SDK's own Client/StdioClientTransport (which
// performs the initialize handshake in connect() and frames tools/call for
// us). Each test gets its own temp git repo and temp HOME so repoRoot
// resolution (getRepoRoot()) and globalDir() (~/.graphene/global) both land
// in disposable directories.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// Normal top-level import: this test file always runs on Node 24. Only
// src/migrate.ts needs the lazy require, so graphene itself keeps working on
// older Node when there is nothing to migrate.
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const DIST_INDEX = join(REPO_ROOT, "dist", "index.js");

beforeAll(() => {
  execSync("node node_modules/typescript/bin/tsc", { cwd: REPO_ROOT, stdio: "inherit" });
}, 60000);

function parseResult<T>(result: CallToolResult): T {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error(`Expected a text content block, got: ${JSON.stringify(result.content)}`);
  }
  return JSON.parse(first.text) as T;
}

interface Session {
  client: Client;
  repoRoot: string;
  home: string;
}

async function startSession(): Promise<Session> {
  const repoRoot = mkdtempSync(join(tmpdir(), "graphene-e2e-repo-"));
  const home = mkdtempSync(join(tmpdir(), "graphene-e2e-home-"));
  execSync("git init", { cwd: repoRoot, stdio: "ignore" });
  execSync("git config user.email test@test.com", { cwd: repoRoot, stdio: "ignore" });
  execSync("git config user.name Test", { cwd: repoRoot, stdio: "ignore" });
  execSync("git commit --allow-empty -m init", { cwd: repoRoot, stdio: "ignore" });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_INDEX],
    cwd: repoRoot,
    env: { ...process.env, HOME: home },
  });
  const client = new Client({ name: "graphene-e2e-test", version: "0.0.1" });
  await client.connect(transport);

  return { client, repoRoot, home };
}

async function stopSession(session: Session): Promise<void> {
  await session.client.close();
  rmSync(session.repoRoot, { recursive: true, force: true });
  rmSync(session.home, { recursive: true, force: true });
}

describe("e2e: compiled server over MCP stdio", () => {
  let session: Session;

  beforeEach(async () => {
    session = await startSession();
  }, 20000);

  afterEach(async () => {
    await stopSession(session);
  });

  it("upsert_node then read shows it", async () => {
    await session.client.callTool({
      name: "upsert_node",
      arguments: { name: "auth", type: "subsystem", summary: "Auth system" },
    });

    const readResult = await session.client.callTool({ name: "read", arguments: { name: "auth" } });
    const node = parseResult<{ name: string; summary: string }>(readResult as CallToolResult);
    expect(node.name).toBe("auth");
    expect(node.summary).toBe("Auth system");
  });

  it("learn then read shows the observation with a string id", async () => {
    await session.client.callTool({
      name: "upsert_node",
      arguments: { name: "auth", type: "subsystem" },
    });
    const learnResult = await session.client.callTool({
      name: "learn",
      arguments: { node_name: "auth", content: "Uses JWT, not sessions" },
    });
    const learned = parseResult<{ id: string; node_name: string }>(learnResult as CallToolResult);
    expect(typeof learned.id).toBe("string");
    expect(learned.node_name).toBe("auth");

    const readResult = await session.client.callTool({ name: "read", arguments: { name: "auth" } });
    const node = parseResult<{ observations: Array<{ id: string; content: string }> }>(
      readResult as CallToolResult
    );
    expect(node.observations).toHaveLength(1);
    expect(node.observations[0].id).toBe(learned.id);
    expect(node.observations[0].content).toBe("Uses JWT, not sessions");
  });

  it("remove_observation(node_name, id) removes it", async () => {
    await session.client.callTool({ name: "upsert_node", arguments: { name: "auth", type: "subsystem" } });
    const learnResult = await session.client.callTool({
      name: "learn",
      arguments: { node_name: "auth", content: "to be removed" },
    });
    const { id } = parseResult<{ id: string }>(learnResult as CallToolResult);

    const removeResult = await session.client.callTool({
      name: "remove_observation",
      arguments: { node_name: "auth", id },
    });
    expect(parseResult<{ removed: boolean }>(removeResult as CallToolResult).removed).toBe(true);

    const readResult = await session.client.callTool({ name: "read", arguments: { name: "auth" } });
    const node = parseResult<{ observations: unknown[] }>(readResult as CallToolResult);
    expect(node.observations).toHaveLength(0);
  });

  it("status reports counts with no observation content", async () => {
    await session.client.callTool({ name: "upsert_node", arguments: { name: "auth", type: "subsystem" } });
    await session.client.callTool({
      name: "learn",
      arguments: { node_name: "auth", content: "a secret internal detail that must not leak into status" },
    });

    const statusResult = (await session.client.callTool({ name: "status", arguments: {} })) as CallToolResult;
    const status = parseResult<{ nodes: Array<{ name: string; observation_count: number }> }>(statusResult);
    expect(status.nodes).toHaveLength(1);
    expect(status.nodes[0].observation_count).toBe(1);

    const rawText = (statusResult.content[0] as { type: "text"; text: string }).text;
    expect(rawText).not.toContain("secret internal detail");
  });

  it("search returns bounded results with an omitted count", async () => {
    for (let i = 0; i < 25; i++) {
      await session.client.callTool({
        name: "upsert_node",
        arguments: { name: `node-${String(i).padStart(2, "0")}`, type: "subsystem", summary: "findme" },
      });
    }

    const searchResult = await session.client.callTool({ name: "search", arguments: { query: "findme" } });
    const parsed = parseResult<{ results: unknown[]; omitted?: number }>(searchResult as CallToolResult);
    expect(parsed.results).toHaveLength(20);
    expect(parsed.omitted).toBe(5);
  });

  it("batch with an invalid edge writes nothing", async () => {
    const batchResult = (await session.client.callTool({
      name: "batch",
      arguments: {
        nodes: [{ name: "auth", type: "subsystem" }],
        edges: [{ from: "auth", to: "does-not-exist", type: "depends_on" }],
      },
    })) as CallToolResult;
    expect(batchResult.isError).toBe(true);

    const indexResult = await session.client.callTool({ name: "read", arguments: {} });
    const index = parseResult<{ nodes: unknown[] }>(indexResult as CallToolResult);
    expect(index.nodes).toHaveLength(0);
  });
});

// A second server-session flavor: cwd is the parent of two child git repos
// (no repo of its own), so discoverScopes finds both and the server runs the
// multi-repo dispatch path. Everything else about the transport is identical
// to startSession/stopSession above.
interface MultiSession {
  client: Client;
  parent: string;
  home: string;
}

async function startMultiRepoSession(): Promise<MultiSession> {
  const parent = mkdtempSync(join(tmpdir(), "graphene-e2e-multi-"));
  const home = mkdtempSync(join(tmpdir(), "graphene-e2e-home-"));

  for (const name of ["portal", "worker"]) {
    const repoPath = join(parent, name);
    mkdirSync(repoPath, { recursive: true });
    execSync("git init", { cwd: repoPath, stdio: "ignore" });
    execSync("git config user.email test@test.com", { cwd: repoPath, stdio: "ignore" });
    execSync("git config user.name Test", { cwd: repoPath, stdio: "ignore" });
    execSync("git commit --allow-empty -m init", { cwd: repoPath, stdio: "ignore" });
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_INDEX],
    cwd: parent,
    env: { ...process.env, HOME: home },
  });
  const client = new Client({ name: "graphene-e2e-multi-test", version: "0.0.1" });
  await client.connect(transport);

  return { client, parent, home };
}

async function stopMultiRepoSession(session: MultiSession): Promise<void> {
  await session.client.close();
  rmSync(session.parent, { recursive: true, force: true });
  rmSync(session.home, { recursive: true, force: true });
}

describe("e2e: multi-repo session over MCP stdio", () => {
  let session: MultiSession;

  beforeEach(async () => {
    session = await startMultiRepoSession();
  }, 20000);

  afterEach(async () => {
    await stopMultiRepoSession(session);
  });

  it("aggregated read index carries repo fields, and a qualified learn round-trips", async () => {
    await session.client.callTool({
      name: "upsert_node",
      arguments: { name: "portal:auth", type: "subsystem", summary: "Portal auth" },
    });
    await session.client.callTool({
      name: "upsert_node",
      arguments: { name: "worker:queue", type: "subsystem", summary: "Job queue" },
    });

    const indexResult = await session.client.callTool({ name: "read", arguments: {} });
    const index = parseResult<{ nodes: Array<{ repo: string; name: string; type: string; summary: string }> }>(
      indexResult as CallToolResult
    );
    expect(index.nodes).toEqual([
      { repo: "portal", name: "auth", type: "subsystem", summary: "Portal auth" },
      { repo: "worker", name: "queue", type: "subsystem", summary: "Job queue" },
    ]);

    const learnResult = await session.client.callTool({
      name: "learn",
      arguments: { node_name: "portal:auth", content: "Uses JWT, not sessions" },
    });
    const learned = parseResult<{ id: string; node_name: string }>(learnResult as CallToolResult);
    expect(learned.node_name).toBe("auth");

    const readResult = await session.client.callTool({ name: "read", arguments: { name: "portal:auth" } });
    const node = parseResult<{
      repo: string;
      name: string;
      observations: Array<{ id: string; content: string }>;
    }>(readResult as CallToolResult);
    expect(node.repo).toBe("portal");
    expect(node.name).toBe("auth");
    expect(node.observations).toHaveLength(1);
    expect(node.observations[0].id).toBe(learned.id);
    expect(node.observations[0].content).toBe("Uses JWT, not sessions");
  });
});

// Covers the v0.11 startup migration end to end: a legacy sql.js context.db
// seeded before the server ever starts must be migrated in place (server.ts
// itself never sees the legacy db -- index.ts migrates every scope before
// createServer is called), leaving the graph readable through the normal
// file-store `read` tool and the legacy db renamed out of the way.
describe("e2e: legacy db migration on startup", () => {
  it("migrates a seeded legacy context.db before serving, renaming it to context.db.migrated", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "graphene-e2e-migrate-repo-"));
    const home = mkdtempSync(join(tmpdir(), "graphene-e2e-migrate-home-"));
    execSync("git init", { cwd: repoRoot, stdio: "ignore" });
    execSync("git config user.email test@test.com", { cwd: repoRoot, stdio: "ignore" });
    execSync("git config user.name Test", { cwd: repoRoot, stdio: "ignore" });
    execSync("git commit --allow-empty -m init", { cwd: repoRoot, stdio: "ignore" });

    const grapheneDirPath = join(repoRoot, ".graphene");
    mkdirSync(grapheneDirPath, { recursive: true });
    const dbPath = join(grapheneDirPath, "context.db");
    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
      CREATE TABLE nodes (
        name TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        summary TEXT,
        entry_points TEXT DEFAULT '[]',
        covers TEXT DEFAULT '[]',
        last_commit TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE edges (
        from_node TEXT NOT NULL REFERENCES nodes(name) ON DELETE CASCADE,
        to_node TEXT NOT NULL REFERENCES nodes(name) ON DELETE CASCADE,
        type TEXT NOT NULL,
        reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (from_node, to_node, type)
      );
      CREATE TABLE observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_name TEXT NOT NULL REFERENCES nodes(name) ON DELETE CASCADE,
        content TEXT NOT NULL,
        source TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE project_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(category, subject)
      );
    `);
    legacyDb
      .prepare("INSERT INTO nodes (name, type, summary) VALUES (?, ?, ?)")
      .run("auth", "subsystem", "Legacy auth node");
    legacyDb
      .prepare("INSERT INTO observations (node_name, content, source) VALUES (?, ?, ?)")
      .run("auth", "Uses JWT", "legacy");
    legacyDb.close();

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [DIST_INDEX],
      cwd: repoRoot,
      env: { ...process.env, HOME: home },
    });
    const client = new Client({ name: "graphene-e2e-migrate-test", version: "0.0.1" });

    try {
      await client.connect(transport);

      const readResult = await client.callTool({ name: "read", arguments: { name: "auth" } });
      const node = parseResult<{
        name: string;
        summary: string;
        observations: Array<{ content: string; source: string | null }>;
      }>(readResult as CallToolResult);
      expect(node.name).toBe("auth");
      expect(node.summary).toBe("Legacy auth node");
      expect(node.observations).toHaveLength(1);
      expect(node.observations[0].content).toBe("Uses JWT");
      expect(node.observations[0].source).toBe("legacy");

      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(`${dbPath}.migrated`)).toBe(true);
    } finally {
      await client.close();
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  }, 20000);
});
