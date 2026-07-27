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

function dbPath() {
  return join(homedir(), ".graphene", "graphene.db");
}

async function getStatus(repoRoot) {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(import.meta.dirname, "..");
  const { openDatabase, initSchema, ensureRepo } =
    await import(join(pluginRoot, "dist", "db.js"));
  const { handleStatus } = await import(join(pluginRoot, "dist", "tools", "status.js"));

  const db = openDatabase(dbPath());
  initSchema(db);

  try {
    const repoId = ensureRepo(db, repoRoot, null);
    return handleStatus(db, repoId, repoRoot, {});
  } finally {
    db.close();
  }
}

async function getAffectedNodes(repoRoot) {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(import.meta.dirname, "..");
  const { openDatabase, initSchema } =
    await import(join(pluginRoot, "dist", "db.js"));

  if (!existsSync(dbPath())) return [];

  const db = openDatabase(dbPath());
  initSchema(db);

  try {
    let committedFiles;
    try {
      committedFiles = execSync("git diff-tree --no-commit-id --name-only -r HEAD", {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }

    if (committedFiles.length === 0) return [];

    const repo = db.prepare("SELECT id FROM repos WHERE root_path = ?").get(repoRoot);
    if (!repo) return [];
    const nodes = db
      .prepare("SELECT name, covers FROM nodes WHERE repo_id = ?")
      .all(repo.id);

    const affected = [];
    for (const node of nodes) {
      const covers = JSON.parse(node.covers || "[]");
      if (covers.length === 0) continue;

      const matching = committedFiles.filter(file =>
        covers.some(pattern => file.startsWith(pattern.replace(/\*.*$/, "")))
      );

      if (matching.length > 0) {
        affected.push({ name: node.name, files: matching });
      }
    }

    return affected;
  } finally {
    db.close();
  }
}

function formatStatus(status) {
  const lines = [`HEAD: ${status.head}`];

  if (status.nodes.length === 0) {
    lines.push("Graph: empty (no nodes). You MUST populate with batch() after exploring the codebase.");
  } else {
    lines.push(`Nodes (${status.nodes.length}):`);
    for (const n of status.nodes) {
      lines.push(`  - ${n.name} [${n.type}]${n.summary ? ": " + n.summary : ""}`);
      const obs = status.observations_by_node?.[n.name];
      if (obs && obs.length > 0) {
        for (const o of obs) {
          lines.push(`      * ${o}`);
        }
      }
    }
  }

  if (status.stale_nodes.length > 0) {
    lines.push(`STALE nodes (${status.stale_nodes.length}) - you MUST update these before working on them:`);
    for (const s of status.stale_nodes) {
      const detail = s.reason === "changed" ? ` (${s.changed_files.join(", ")})` : "";
      lines.push(`  - ${s.name}: ${s.reason}${detail}`);
    }
  }

  if (status.project_facts.length > 0) {
    lines.push(`Project facts (${status.project_facts.length}):`);
    for (const f of status.project_facts) {
      lines.push(`  - [${f.category}/${f.subject}] ${f.content}`);
    }
  }

  if (status.global_facts.length > 0) {
    lines.push(`Global facts (${status.global_facts.length}):`);
    for (const f of status.global_facts) {
      lines.push(`  - [${f.category}/${f.subject}] ${f.content}`);
    }
  }

  return lines.join("\n");
}

// Graphene tools surface under different prefixes depending on how the server
// is loaded: "mcp__graphene__<tool>" as a standalone MCP server, or
// "mcp__plugin_graphene_graphene__<tool>" when installed as a Claude Code
// plugin. Match on the "graphene" segment, and compare against the bare tool
// name (the part after the last "__") so both forms work.
function isGrapheneTool(toolName) {
  return /^mcp__.*graphene.*__/.test(toolName || "");
}

function bareToolName(toolName) {
  const parts = (toolName || "").split("__");
  return parts[parts.length - 1];
}

const WRITE_TOOLS = new Set([
  "learn",
  "upsert_node",
  "link",
  "unlink",
  "batch",
  "delete_node",
  "remove_observation",
  "global_write",
  "global_delete",
  "project_write",
  "project_delete",
]);

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

  // SessionStart fires on startup, resume, clear, and after compaction. Inject
  // the standing rules block here instead of writing it into CLAUDE.md. The
  // text is imported from the compiled dist so it never drifts from the server.
  if (hook_event_name === "SessionStart") {
    try {
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(import.meta.dirname, "..");
      const { GRAPHENE_RULES } = await import(join(pluginRoot, "dist", "claude-md.js"));
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: GRAPHENE_RULES,
        },
      }));
    } catch {}
    process.exit(0);
  }

  if (Math.random() < 0.01) cleanupStaleSessions();

  const state = readState(session_id);
  state.last_interaction = new Date().toISOString();

  if (hook_event_name === "PostToolUse" && isGrapheneTool(tool_name)) {
    const bare = bareToolName(tool_name);
    if (bare === "status") {
      state.status_injected = true;
    }
    if (WRITE_TOOLS.has(bare)) {
      state.last_write = new Date().toISOString();
    }
    writeState(session_id, state);
    process.exit(0);
  }

  if (hook_event_name === "PostToolUse" && tool_name === "Bash") {
    const command = tool_input?.command || "";

    if (/git\s+commit/.test(command)) {
      const repoRoot = getRepoRoot();
      let message = "You just committed code.";

      if (repoRoot) {
        try {
          const affected = await getAffectedNodes(repoRoot);
          if (affected.length > 0) {
            message += "\n\nThese graphene nodes cover files in this commit:" +
              affected.map(a => `\n  - ${a.name} (${a.files.join(", ")})`).join("") +
              "\n\nYou MUST review and update each affected node:" +
              "\n  1. Record what changed with learn(node, observation)" +
              "\n  2. Update summary if the purpose shifted" +
              "\n  3. Update entry_points and covers if files were added/renamed" +
              "\n  4. Set last_commit to the new HEAD" +
              "\nBumping last_commit alone is not sufficient.";
          }
        } catch {}
      }

      writeState(session_id, state);
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: message,
        },
      }));
    } else if (/git\s+push/.test(command)) {
      writeState(session_id, state);
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext:
            "You just pushed code. Verify all graphene nodes affected by " +
            "pushed commits have updated observations and last_commit.",
        },
      }));
    } else {
      writeState(session_id, state);
    }
    process.exit(0);
  }

  if (hook_event_name === "PreToolUse") {
    if (isGrapheneTool(tool_name)) {
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
          "You MUST call read(name) on relevant nodes before working on any subsystem. " +
          "The graph contains entry_points, observations, and edges that prevent wasted tool calls. " +
          "After changing code, you MUST update affected nodes with learn() and last_commit."
        );
      } catch {
        state.status_injected = true;
      }
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
