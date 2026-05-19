import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = join(import.meta.dirname, "../../hooks/graphene-guard.mjs");
let tempHome: string;

interface RunOpts {
  cwd?: string;
  env?: Record<string, string>;
}

function run(input: Record<string, unknown>, opts?: RunOpts): { stdout: string; state: Record<string, unknown> | null } {
  const stdin = JSON.stringify(input);
  let stdout: string;
  try {
    stdout = execFileSync("node", [SCRIPT], {
      input: stdin,
      encoding: "utf-8",
      cwd: opts?.cwd,
      env: { ...process.env, HOME: tempHome, ...opts?.env },
      timeout: 10000,
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

function createTempGitRepo(): string {
  const path = mkdtempSync(join(tmpdir(), "graphene-hook-repo-"));
  execSync("git init", { cwd: path, stdio: "ignore" });
  execSync("git config user.email test@test.com", { cwd: path, stdio: "ignore" });
  execSync("git config user.name Test", { cwd: path, stdio: "ignore" });
  execSync("git commit --allow-empty -m init", { cwd: path, stdio: "ignore" });
  return path;
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "graphene-hook-test-"));
});

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true });
});

describe("graphene-guard hook", () => {
  describe("PreToolUse - status injection", () => {
    let repoPath: string;

    beforeEach(() => {
      repoPath = createTempGitRepo();
    });

    afterEach(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it("injects graph status on first PreToolUse", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: {},
      }, { cwd: repoPath });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain("Graphene context graph");
      expect(output.hookSpecificOutput.additionalContext).toContain("HEAD:");
    });

    it("shows empty graph message for fresh repo", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: {},
      }, { cwd: repoPath });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain("empty");
    });

    it("does not inject again after first time", () => {
      run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: {},
      }, { cwd: repoPath });

      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: {},
      }, { cwd: repoPath });
      expect(stdout.trim()).toBe("");
    });

    it("sets status_injected in state", () => {
      const { state } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: {},
      }, { cwd: repoPath });
      expect(state?.status_injected).toBe(true);
    });

    it("skips graphene tools silently", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "mcp__graphene__read",
        tool_input: {},
      }, { cwd: repoPath });
      expect(stdout.trim()).toBe("");
    });

    it("skips when not in a git repo", () => {
      const noGit = mkdtempSync(join(tmpdir(), "graphene-no-git-"));
      try {
        const { stdout } = run({
          session_id: "s1",
          hook_event_name: "PreToolUse",
          tool_name: "Read",
          tool_input: {},
        }, { cwd: noGit });
        expect(stdout.trim()).toBe("");
      } finally {
        rmSync(noGit, { recursive: true, force: true });
      }
    });
  });

  describe("PostToolUse - graphene state tracking", () => {
    it("sets status_injected on manual status call", () => {
      const { state } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "mcp__graphene__status",
        tool_input: {},
      });
      expect(state?.status_injected).toBe(true);
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
      expect(output.hookSpecificOutput.additionalContext).toContain("You just committed code");
    });

    it("returns reminder on git push", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "git push origin main" },
      });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain("You just pushed code");
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
