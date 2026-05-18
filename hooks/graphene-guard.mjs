#!/usr/bin/env node

import { readState, writeState, cleanupStaleSessions } from "./lib/state.mjs";

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

const NUDGE_INTERVAL_MS = 30 * 60 * 1000;

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
      state.status_called = true;
    }
    if (WRITE_TOOLS.has(tool_name)) {
      state.last_write = new Date().toISOString();
    }
    writeState(session_id, state);
    process.exit(0);
  }

  if (hook_event_name === "PostToolUse" && tool_name === "Bash") {
    const command = tool_input?.command || "";
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

    const messages = [];

    if (!state.status_called) {
      messages.push(
        "MANDATORY: You have not called mcp__graphene__status yet this session. " +
        "You must call status before proceeding with any work. " +
        "Do not read files, grep, or explore until you have called status."
      );
    }

    if (state.status_called && state.last_write) {
      const elapsed = Date.now() - new Date(state.last_write).getTime();
      if (elapsed > NUDGE_INTERVAL_MS) {
        messages.push(
          "It has been over 30 minutes since you last updated the graphene context graph. " +
          "Consider calling learn, upsert_node, or link to record what you have " +
          "discovered or changed during this session."
        );
      }
    } else if (state.status_called && !state.last_write && state.session_start) {
      const elapsed = Date.now() - new Date(state.session_start).getTime();
      if (elapsed > NUDGE_INTERVAL_MS) {
        messages.push(
          "You have been working for over 30 minutes without updating the graphene graph. " +
          "If you have learned anything or made changes, record them with learn, upsert_node, or link."
        );
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
