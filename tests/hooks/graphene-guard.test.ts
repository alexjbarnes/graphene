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

  describe("search counter nudge", () => {
    it("increments searches_since_read on grep", () => {
      run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "mcp__graphene__status", tool_input: {} });
      run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "grep -r handleAuth src/" } });
      run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "grep TODO src/" } });
      const { state } = run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "find . -name '*.ts'" } });
      expect(state?.searches_since_read).toBe(3);
    });

    it("resets counter on graphene read", () => {
      run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "mcp__graphene__status", tool_input: {} });
      run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "grep -r foo src/" } });
      run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "grep -r bar src/" } });
      const { state } = run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "mcp__graphene__read", tool_input: {} });
      expect(state?.searches_since_read).toBe(0);
    });

    it("nudges after 5 searches without graphene read", () => {
      run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "mcp__graphene__status", tool_input: {} });
      for (let i = 0; i < 5; i++) {
        run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: `grep -r term${i} src/` } });
      }
      const { stdout } = run({ session_id: "s1", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain("grep/find");
      expect(output.hookSpecificOutput.additionalContext).toContain("5");
    });

    it("no nudge when under threshold", () => {
      run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "mcp__graphene__status", tool_input: {} });
      for (let i = 0; i < 4; i++) {
        run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: `grep -r term${i} src/` } });
      }
      const { stdout } = run({ session_id: "s1", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} });
      expect(stdout.trim()).toBe("");
    });

    it("does not count non-search bash commands", () => {
      run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "mcp__graphene__status", tool_input: {} });
      run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "npm test" } });
      run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "cat foo.ts" } });
      const { state } = run({ session_id: "s1", hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "ls -la" } });
      expect(state?.searches_since_read).toBe(0);
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
