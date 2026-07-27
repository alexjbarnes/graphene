// End-to-end coverage against the compiled server (dist/index.js), driven
// over real MCP stdio via the SDK's own Client/StdioClientTransport (which
// performs the initialize handshake in connect() and frames tools/call for
// us). Each test gets its own temp git repo and temp HOME so repoRoot
// resolution (getRepoRoot()) and globalDir() (~/.graphene/global) both land
// in disposable directories.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
