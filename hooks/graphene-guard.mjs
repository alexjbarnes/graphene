#!/usr/bin/env node

import { execSync } from "node:child_process";
import { join } from "node:path";
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
  const { globalDir } = await import(join(pluginRoot, "dist", "store.js"));
  const { handleStatus } = await import(join(pluginRoot, "dist", "tools", "status.js"));
  return handleStatus(repoRoot, globalDir(), {});
}

// Only used when getRepoRoot() is null, i.e. the session's cwd is not itself
// inside a repo. Discovers child repos beneath cwd the same way the server
// does (dist/scope.js), so a parent-directory session gets a status section
// per repo instead of being skipped outright. Any failure (including the
// discoverScopes cap on too many repos) degrades to "no scopes", which the
// caller treats the same as a plain non-repo directory: skip quietly.
async function discoverMultiRepoScopes() {
  try {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(import.meta.dirname, "..");
    const { discoverScopes } = await import(join(pluginRoot, "dist", "scope.js"));
    return discoverScopes(process.cwd());
  } catch {
    return [];
  }
}

// Routes through the same dispatch("status") the MCP server uses, so a
// multi-repo session's injected status is produced by exactly the code path
// that serves the status tool, never a hook-local reimplementation.
async function getMultiStatus(scopes) {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(import.meta.dirname, "..");
  const { dispatch } = await import(join(pluginRoot, "dist", "server.js"));
  const { globalDir } = await import(join(pluginRoot, "dist", "store.js"));
  return dispatch({ scopes, globalDir: globalDir() }, "status", {});
}

function isGrapheneFile(file) {
  return file === ".graphene" || file.startsWith(".graphene/");
}

function getStagedFiles(repoRoot) {
  try {
    return execSync("git diff --cached --name-only", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function getCommittedFiles(repoRoot) {
  try {
    return execSync("git diff-tree --no-commit-id --name-only -r HEAD", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// Matches `files` (either staged paths or the files a commit just touched)
// against every node's `covers` patterns, prefix-style: a pattern's trailing
// glob (if any) is stripped, and a file matches if it starts with what
// remains. Shared by the pre-commit gate (staged files) and the post-commit
// reminder (committed files) so the two never drift on what "affected" means.
async function computeAffectedNodes(repoRoot, files) {
  if (files.length === 0) return [];

  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(import.meta.dirname, "..");
  const { listNodes, readNode } = await import(join(pluginRoot, "dist", "store.js"));

  const affected = [];
  for (const name of listNodes(repoRoot)) {
    const node = readNode(repoRoot, name);
    if (!node || node.covers.length === 0) continue;

    const matching = files.filter(file =>
      node.covers.some(pattern => file.startsWith(pattern.replace(/\*.*$/, "")))
    );

    if (matching.length > 0) {
      affected.push({ name, files: matching });
    }
  }

  return affected;
}

// PreToolUse gate, fired just before a `git commit` runs. Staged files
// (rather than the eventual commit's files, which do not exist yet) are
// compared against node covers. Silent unless there is something staged that
// a node covers and no `.graphene/` path is staged alongside it -- once
// `.graphene/` is part of what is about to be committed, the graph is already
// riding this commit and there is nothing to gate.
async function buildPreCommitMessage(repoRoot) {
  const staged = getStagedFiles(repoRoot);
  if (staged.length === 0) return null;
  if (staged.some(isGrapheneFile)) return null;

  const affected = await computeAffectedNodes(repoRoot, staged);
  if (affected.length === 0) return null;

  return "You are about to commit. These graphene nodes cover staged files:" +
    affected.map(a => `\n  - ${a.name} (${a.files.join(", ")})`).join("") +
    "\n\nUpdate them NOW (learn / upsert_node / last_commit) and stage the .graphene/ changes, " +
    "so the graph rides this commit. Then re-run the commit.";
}

// PostToolUse follow-up, fired just after `git commit` returns. Now that the
// pre-commit gate above is the primary enforcement point, this is only a
// light backstop: silent whenever the commit already carried `.graphene/`
// changes (the desired end state) or touched no covered files at all.
async function buildPostCommitMessage(repoRoot) {
  const committed = getCommittedFiles(repoRoot);
  if (committed.length === 0) return null;
  if (committed.some(isGrapheneFile)) return null;

  const affected = await computeAffectedNodes(repoRoot, committed);
  if (affected.length === 0) return null;

  return "This commit touched files these graphene nodes cover, but .graphene/ was not part of it:" +
    affected.map(a => `\n  - ${a.name} (${a.files.join(", ")})`).join("") +
    "\n\nUpdate them, then `git commit --amend` (or a follow-up commit), so the graph catches up.";
}

// Renders one repo's status the same way regardless of whether it is the
// only repo in the session or one section of a multi-repo one. Status is a
// bounded map: node index with observation counts, stale names, and fact
// keys. Bodies are never injected; detail comes from read(name), project_read,
// and global_read on demand. `global_facts` is optional here because
// multi-repo per-repo entries omit it (globals are session-wide, not
// per-repo -- see formatMultiStatus).
function formatStatusBody(status) {
  const lines = [`HEAD: ${status.head}`];

  if (status.nodes.length === 0) {
    lines.push("Graph: empty (no nodes). You MUST populate with batch() after exploring the codebase.");
  } else {
    lines.push(`Nodes (${status.nodes.length}):`);
    for (const n of status.nodes) {
      const obs = n.observation_count > 0 ? ` (${n.observation_count} obs)` : "";
      lines.push(`  - ${n.name} [${n.type}]${obs}${n.summary ? ": " + n.summary : ""}`);
    }
  }

  if (status.stale_nodes.length > 0) {
    lines.push(`STALE nodes (${status.stale_nodes.length}) - you MUST update these before working on them:`);
    for (const s of status.stale_nodes) {
      const detail = s.reason === "changed" ? ` (${s.changed_files.join(", ")})` : "";
      lines.push(`  - ${s.name}: ${s.reason}${detail}`);
    }
  }

  if (status.project_facts.count > 0) {
    lines.push(`Project facts (${status.project_facts.count}), read with project_read:`);
    lines.push(`  ${status.project_facts.keys.join(", ")}`);
  }

  if (status.global_facts && status.global_facts.count > 0) {
    lines.push(`Global facts (${status.global_facts.count}), read with global_read:`);
    lines.push(`  ${status.global_facts.keys.join(", ")}`);
  }

  return lines.join("\n");
}

// Multi-repo shape from dispatch(ctx, "status", {}): { repos: [...], global_facts }.
// One section per repo, `=== name ===` style, using the same body lines as
// the single-repo case; a repo whose own status call failed (e.g. a freshly
// `git init`ed sibling with no commits) renders as a one-line error instead of
// dropping the whole injection. Globals are printed once at the end, since
// they are session-wide rather than per-repo.
function formatMultiStatus(status) {
  const sections = status.repos.map((repo) => {
    const header = `=== ${repo.repo} ===`;
    if ("error" in repo) {
      return `${header}\nstatus unavailable: ${repo.error}`;
    }
    return `${header}\n${formatStatusBody(repo)}`;
  });

  if (status.global_facts.count > 0) {
    sections.push(
      `Global facts (${status.global_facts.count}), read with global_read:\n  ${status.global_facts.keys.join(", ")}`
    );
  }

  return sections.join("\n\n");
}

// Single-repo status has no `repos` field, so this dispatches on shape rather
// than needing the caller to know which one it built.
function formatStatus(status) {
  if (Array.isArray(status.repos)) return formatMultiStatus(status);
  return formatStatusBody(status);
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
      let message = null;

      if (repoRoot) {
        try {
          message = await buildPostCommitMessage(repoRoot);
        } catch {}
      }

      writeState(session_id, state);
      if (message) {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: message,
          },
        }));
      }
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
    const messages = [];

    if (!state.status_injected) {
      try {
        let status;
        if (repoRoot) {
          status = await getStatus(repoRoot);
        } else {
          const scopes = await discoverMultiRepoScopes();
          status = scopes.length > 0 ? await getMultiStatus(scopes) : null;
        }
        if (status) {
          messages.push(
            "Graphene context graph for this repo:\n" +
            formatStatus(status) + "\n\n" +
            "You MUST call read(name) on relevant nodes before working on any subsystem. " +
            "The graph contains entry_points, observations, and edges that prevent wasted tool calls. " +
            "After changing code, you MUST update affected nodes with learn() and last_commit."
          );
        }
      } catch {
        // fall through; still mark injected below so a persistent failure
        // (e.g. a corrupt node file) does not retry on every tool call
      }
      state.status_injected = true;
    }

    // The commit gate is single-repo only: a commit's cwd is always inside
    // exactly one repo, so getRepoRoot() (not multi-repo scope discovery)
    // is already the right answer, and it is skipped entirely in a
    // parent-directory multi-repo session where getRepoRoot() is null.
    if (repoRoot && tool_name === "Bash" && /git\s+commit/.test(tool_input?.command || "")) {
      try {
        const preCommit = await buildPreCommitMessage(repoRoot);
        if (preCommit) messages.push(preCommit);
      } catch {}
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
