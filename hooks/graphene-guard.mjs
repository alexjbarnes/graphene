#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readState, writeState, cleanupStaleSessions } from "./lib/state.mjs";

function getRepoRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

async function getStatus(repoRoot) {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(import.meta.dirname, "..");
  const { initSql, openDatabase, initRepoSchema, initGlobalSchema } =
    await import(join(pluginRoot, "dist", "db.js"));
  const { handleStatus } = await import(join(pluginRoot, "dist", "tools", "status.js"));

  await initSql();

  const repoDbPath = join(repoRoot, ".graphene", "context.db");
  const globalDbPath = join(homedir(), ".graphene", "global.db");

  const repoDB = openDatabase(repoDbPath);
  initRepoSchema(repoDB);
  const globalDB = openDatabase(globalDbPath);
  initGlobalSchema(globalDB);

  try {
    return handleStatus(repoDB, globalDB, repoRoot, {});
  } finally {
    repoDB.close();
    globalDB.close();
  }
}

function formatStatus(status) {
  const lines = [`HEAD: ${status.head}`];

  if (status.nodes.length === 0) {
    lines.push("Graph: empty (no nodes). Populate with batch() after exploring.");
  } else {
    lines.push(`Nodes (${status.nodes.length}):`);
    for (const n of status.nodes) {
      lines.push(`  - ${n.name} [${n.type}]${n.summary ? ": " + n.summary : ""}`);
    }
  }

  if (status.stale_nodes.length > 0) {
    lines.push(`Stale (${status.stale_nodes.length}):`);
    for (const s of status.stale_nodes) {
      const detail = s.reason === "changed" ? ` (${s.changed_files.join(", ")})` : "";
      lines.push(`  - ${s.name}: ${s.reason}${detail}`);
    }
  }

  if (status.facts.length > 0) {
    lines.push(`Facts (${status.facts.length}):`);
    for (const f of status.facts) {
      lines.push(`  - [${f.category}/${f.subject}] ${f.content}`);
    }
  }

  return lines.join("\n");
}

const WRITE_TOOLS = new Set([
  "mcp__graphene__learn",
  "mcp__graphene__upsert_node",
  "mcp__graphene__link",
  "mcp__graphene__unlink",
  "mcp__graphene__batch",
  "mcp__graphene__delete_node",
  "mcp__graphene__remove_observation",
  "mcp__graphene__global_write",
]);

const READ_TOOLS = new Set([
  "mcp__graphene__read",
  "mcp__graphene__search",
  "mcp__graphene__status",
]);

const SEARCH_PATTERN = /\b(grep|find|rg|ag|ack)\b/;
const SEARCH_NUDGE_THRESHOLD = 5;

async function main() {
  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    process.exit(0);
  }

  const { hook_event_name, tool_name, tool_input, session_id } = input;

  if (!session_id) process.exit(0);

  if (Math.random() < 0.01) cleanupStaleSessions();

  const state = readState(session_id);
  state.last_interaction = new Date().toISOString();

  if (hook_event_name === "PostToolUse" && tool_name?.startsWith("mcp__graphene__")) {
    if (tool_name === "mcp__graphene__status") {
      state.status_injected = true;
    }
    if (WRITE_TOOLS.has(tool_name)) {
      state.last_write = new Date().toISOString();
    }
    if (READ_TOOLS.has(tool_name)) {
      state.searches_since_read = 0;
    }
    writeState(session_id, state);
    process.exit(0);
  }

  if (hook_event_name === "PostToolUse" && tool_name === "Bash") {
    const command = tool_input?.command || "";
    if (SEARCH_PATTERN.test(command)) {
      state.searches_since_read = (state.searches_since_read || 0) + 1;
    }
    if (/git\s+(commit|push)/.test(command)) {
      writeState(session_id, state);
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext:
            "You just ran a git commit or push. Review the affected graphene nodes: " +
            "update last_commit to the new HEAD, record any non-obvious discoveries " +
            "with learn, and update edges if relationships between subsystems changed.",
        },
      }));
    } else {
      writeState(session_id, state);
    }
    process.exit(0);
  }

  if (hook_event_name === "PreToolUse") {
    if (tool_name?.startsWith("mcp__graphene__")) {
      writeState(session_id, state);
      process.exit(0);
    }

    const repoRoot = getRepoRoot();
    if (!repoRoot) {
      writeState(session_id, state);
      process.exit(0);
    }

    const messages = [];

    if (!state.status_injected) {
      try {
        const status = await getStatus(repoRoot);
        state.status_injected = true;
        messages.push(
          "Graphene context graph for this repo:\n" +
          formatStatus(status) + "\n\n" +
          "Use read(name) to get detail on any node. " +
          "Use learn/upsert_node/batch to record discoveries."
        );
      } catch {
        state.status_injected = true;
      }
    }

    if (state.status_injected && (state.searches_since_read || 0) >= SEARCH_NUDGE_THRESHOLD) {
      messages.push(
        "You have used grep/find " + state.searches_since_read + " times without " +
        "consulting the graphene graph. Call read(name) or search(query) to check " +
        "if a node already covers what you are looking for."
      );
    }

    writeState(session_id, state);

    if (messages.length > 0) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: messages.join("\n\n"),
        },
      }));
    }
    process.exit(0);
  }

  writeState(session_id, state);
  process.exit(0);
}

main();
