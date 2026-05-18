import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = join(import.meta.dirname, "../../hooks/graphene-guard.mjs");
let tempHome: string;

function run(input: Record<string, unknown>): { stdout: string; state: Record<string, unknown> | null } {
  const stdin = JSON.stringify(input);
  let stdout: string;
  try {
    stdout = execFileSync("node", [SCRIPT], {
      input: stdin,
      encoding: "utf-8",
      env: { ...process.env, HOME: tempHome },
      timeout: 5000,
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    stdout = e.stdout || "";
  }

  let state: Record<string, unknown> | null = null;
  const sessionId = input.session_id as string | undefined;
  if (sessionId) {
    try {
      const statePath = join(tempHome, ".graphene", "sessions", `${sessionId}.json`);
      state = JSON.parse(readFileSync(statePath, "utf-8"));
    } catch {}
  }

  return { stdout, state };
}

function parseOutput(stdout: string) {
  if (!stdout.trim()) return null;
  return JSON.parse(stdout);
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "graphene-hook-test-"));
});

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true });
});

describe("graphene-guard hook", () => {
  describe("PreToolUse - status enforcement", () => {
    it("returns reminder when status not called", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: {},
      });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain("must call");
    });

    it("returns no output when status already called", () => {
      run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "mcp__graphene__status",
        tool_input: {},
      });

      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: {},
      });
      expect(stdout.trim()).toBe("");
    });

    it("skips graphene tools silently", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "mcp__graphene__read",
        tool_input: {},
      });
      expect(stdout.trim()).toBe("");
    });
  });

  describe("PreToolUse - time-based nudge", () => {
    it("returns nudge when last_write is old", () => {
      const sessionsDir = join(tempHome, ".graphene", "sessions");
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(join(sessionsDir, "s1.json"), JSON.stringify({
        status_called: true,
        last_write: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
        session_start: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }));

      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: {},
      });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain("30 minutes");
    });

    it("returns no nudge when last_write is recent", () => {
      const sessionsDir = join(tempHome, ".graphene", "sessions");
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(join(sessionsDir, "s1.json"), JSON.stringify({
        status_called: true,
        last_write: new Date().toISOString(),
        session_start: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }));

      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: {},
      });
      expect(stdout.trim()).toBe("");
    });

    it("nudges when no writes and session is old", () => {
      const sessionsDir = join(tempHome, ".graphene", "sessions");
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(join(sessionsDir, "s1.json"), JSON.stringify({
        status_called: true,
        last_write: null,
        session_start: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      }));

      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: {},
      });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain("30 minutes");
    });
  });

  describe("PostToolUse - graphene state tracking", () => {
    it("sets status_called on status", () => {
      const { state } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "mcp__graphene__status",
        tool_input: {},
      });
      expect(state?.status_called).toBe(true);
    });

    it("sets last_write on mutation tools", () => {
      run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "mcp__graphene__status",
        tool_input: {},
      });
      const { state } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "mcp__graphene__learn",
        tool_input: {},
      });
      expect(state?.last_write).toBeTruthy();
    });

    it("does not set last_write on read-only tools", () => {
      const { state } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "mcp__graphene__read",
        tool_input: {},
      });
      expect(state?.last_write).toBeNull();
    });
  });

  describe("PostToolUse - git commit reminder", () => {
    it("returns reminder on git commit", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "fix auth bug"' },
      });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain("git commit or push");
    });

    it("returns reminder on git push", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "git push origin main" },
      });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain("git commit or push");
    });

    it("no output for non-git bash commands", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
      });
      expect(stdout.trim()).toBe("");
    });

    it("no output for git status or git diff", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "git status && git diff" },
      });
      expect(stdout.trim()).toBe("");
    });
  });

  describe("edge cases", () => {
    it("handles missing session_id", () => {
      const { stdout } = run({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: {},
      });
      expect(stdout.trim()).toBe("");
    });

    it("handles empty stdin gracefully", () => {
      let stdout: string;
      try {
        stdout = execFileSync("node", [SCRIPT], {
          input: "",
          encoding: "utf-8",
          env: { ...process.env, HOME: tempHome },
          timeout: 5000,
        });
      } catch (err: unknown) {
        stdout = (err as { stdout?: string }).stdout || "";
      }
      expect(stdout.trim()).toBe("");
    });
  });
});
