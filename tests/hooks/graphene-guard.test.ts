import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTestGitRepo, type TestRepo } from "../helpers.js";

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

    it("skips plugin-named graphene tools silently", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "mcp__plugin_graphene_graphene__read",
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

    it("sets status_injected on plugin-named status call", () => {
      const { state } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "mcp__plugin_graphene_graphene__status",
        tool_input: {},
      });
      expect(state?.status_injected).toBe(true);
    });

    it("sets last_write on plugin-named mutation tools", () => {
      const { state } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "mcp__plugin_graphene_graphene__learn",
        tool_input: {},
      });
      expect(state?.last_write).toBeTruthy();
    });

    it("does not set last_write on plugin-named read-only tools", () => {
      const { state } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "mcp__plugin_graphene_graphene__read",
        tool_input: {},
      });
      expect(state?.last_write).toBeNull();
    });
  });

  describe("PostToolUse - git commit reminder", () => {
    let repoPath: string;

    // Every test in this block starts from a repo that already has a
    // committed node covering src/auth, so each `it` only has to stage and
    // commit the specific combination of files it wants to assert on.
    beforeEach(() => {
      repoPath = createTempGitRepo();
      mkdirSync(join(repoPath, ".graphene", "nodes"), { recursive: true });
      mkdirSync(join(repoPath, "src"), { recursive: true });
      writeFileSync(
        join(repoPath, ".graphene", "nodes", "auth.md"),
        "---\ntype: subsystem\ncovers:\n  - src/auth\n---\n"
      );
      execSync("git add -A && git commit -m 'add auth node'", { cwd: repoPath, stdio: "ignore" });
    });

    afterEach(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it("reminds to update nodes when the commit touched covered files without .graphene/", () => {
      writeFileSync(join(repoPath, "src", "auth.ts"), "export const login = () => {};\n");
      execSync("git add src/auth.ts && git commit -m 'add login'", { cwd: repoPath, stdio: "ignore" });

      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "add login"' },
      }, { cwd: repoPath });

      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain("This commit touched files these graphene nodes cover, but .graphene/ was not part of it:");
      expect(ctx).toContain("auth (src/auth.ts)");
      expect(ctx).toContain("git commit --amend");
    });

    it("stays silent when the commit included .graphene/ changes alongside covered files", () => {
      writeFileSync(join(repoPath, "src", "auth.ts"), "export const login = () => {};\n");
      writeFileSync(
        join(repoPath, ".graphene", "nodes", "auth.md"),
        "---\ntype: subsystem\ncovers:\n  - src/auth\n---\n\n- Added login export <!-- id:abcd -->\n"
      );
      execSync("git add -A && git commit -m 'add login'", { cwd: repoPath, stdio: "ignore" });

      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "add login"' },
      }, { cwd: repoPath });

      expect(stdout.trim()).toBe("");
    });

    it("stays silent when the commit touched no covered files", () => {
      writeFileSync(join(repoPath, "README.md"), "docs\n");
      execSync("git add README.md && git commit -m docs", { cwd: repoPath, stdio: "ignore" });

      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "docs"' },
      }, { cwd: repoPath });

      expect(stdout.trim()).toBe("");
    });

    it("returns reminder on git push", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "git push origin main" },
      }, { cwd: repoPath });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain("You just pushed code");
    });

    it("no output for non-git bash commands", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
      }, { cwd: repoPath });
      expect(stdout.trim()).toBe("");
    });

    it("no output for git status or git diff", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "git status && git diff" },
      }, { cwd: repoPath });
      expect(stdout.trim()).toBe("");
    });
  });

  describe("PreToolUse - pre-commit gate", () => {
    let repoPath: string;

    // As above: a repo with one node already committed, covering src/auth.
    // The one-time status injection is consumed here too, via a throwaway
    // Read call, so every `it` below can assert on the gate message alone.
    beforeEach(() => {
      repoPath = createTempGitRepo();
      mkdirSync(join(repoPath, ".graphene", "nodes"), { recursive: true });
      mkdirSync(join(repoPath, "src"), { recursive: true });
      writeFileSync(
        join(repoPath, ".graphene", "nodes", "auth.md"),
        "---\ntype: subsystem\ncovers:\n  - src/auth\n---\n"
      );
      execSync("git add -A && git commit -m 'add auth node'", { cwd: repoPath, stdio: "ignore" });

      run({ session_id: "s1", hook_event_name: "PreToolUse", tool_name: "Read", tool_input: {} }, { cwd: repoPath });
    });

    afterEach(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it("fires when a staged file is covered by a node and .graphene/ is not staged", () => {
      writeFileSync(join(repoPath, "src", "auth.ts"), "export const login = () => {};\n");
      execSync("git add src/auth.ts", { cwd: repoPath, stdio: "ignore" });

      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "add login"' },
      }, { cwd: repoPath });

      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain("You are about to commit. These graphene nodes cover staged files:");
      expect(ctx).toContain("auth (src/auth.ts)");
      expect(ctx).toContain(
        "Update them NOW (learn / upsert_node / last_commit) and stage the .graphene/ changes, " +
        "so the graph rides this commit. Then re-run the commit."
      );
    });

    it("does not block the tool call, only injects context", () => {
      writeFileSync(join(repoPath, "src", "auth.ts"), "export const login = () => {};\n");
      execSync("git add src/auth.ts", { cwd: repoPath, stdio: "ignore" });

      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "add login"' },
      }, { cwd: repoPath });

      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.hookEventName).toBe("PreToolUse");
      expect(output).not.toHaveProperty("decision");
      expect(output).not.toHaveProperty("permissionDecision");
    });

    it("stays silent when .graphene/ is staged alongside the covered file", () => {
      writeFileSync(join(repoPath, "src", "auth.ts"), "export const login = () => {};\n");
      writeFileSync(
        join(repoPath, ".graphene", "nodes", "auth.md"),
        "---\ntype: subsystem\ncovers:\n  - src/auth\n---\n\n- Added login export <!-- id:abcd -->\n"
      );
      execSync("git add -A", { cwd: repoPath, stdio: "ignore" });

      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "add login"' },
      }, { cwd: repoPath });

      expect(stdout.trim()).toBe("");
    });

    it("stays silent when no staged file is covered by any node", () => {
      writeFileSync(join(repoPath, "README.md"), "docs\n");
      execSync("git add README.md", { cwd: repoPath, stdio: "ignore" });

      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "docs"' },
      }, { cwd: repoPath });

      expect(stdout.trim()).toBe("");
    });

    it("stays silent when nothing is staged", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "empty"' },
      }, { cwd: repoPath });

      expect(stdout.trim()).toBe("");
    });
  });

  describe("PreToolUse - multi-repo status injection", () => {
    let parent: string;
    let portal: TestRepo;
    let worker: TestRepo;

    beforeEach(() => {
      parent = mkdtempSync(join(tmpdir(), "graphene-hook-multi-"));
      portal = createTestGitRepo(parent, "portal");
      worker = createTestGitRepo(parent, "worker");
      portal.writeFile(".graphene/nodes/auth.md", "---\ntype: subsystem\nsummary: Portal auth\n---\n");
    });

    afterEach(() => {
      portal.cleanup();
      worker.cleanup();
      rmSync(parent, { recursive: true, force: true });
    });

    it("renders a section per repo when cwd holds several child repos", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: {},
      }, { cwd: parent });

      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain("=== portal ===");
      expect(ctx).toContain("=== worker ===");
      expect(ctx).toContain("auth [subsystem]");
      expect(ctx).toContain("Portal auth");
    });

    it("sets status_injected in state for a multi-repo session", () => {
      const { state } = run({
        session_id: "s1",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: {},
      }, { cwd: parent });
      expect(state?.status_injected).toBe(true);
    });

    it("renders a status-unavailable line for a repo whose status call fails", () => {
      const broken = join(parent, "broken");
      mkdirSync(broken, { recursive: true });
      execSync("git init", { cwd: broken, stdio: "ignore" });

      const { stdout } = run({
        session_id: "s2",
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: {},
      }, { cwd: parent });

      const output = parseOutput(stdout);
      const ctx = output.hookSpecificOutput.additionalContext;
      expect(ctx).toContain("=== broken ===");
      expect(ctx).toContain("status unavailable:");
    });

    it("skips quietly when the parent directory has zero child repos", () => {
      const empty = mkdtempSync(join(tmpdir(), "graphene-hook-multi-empty-"));
      try {
        const { stdout } = run({
          session_id: "s1",
          hook_event_name: "PreToolUse",
          tool_name: "Read",
          tool_input: {},
        }, { cwd: empty });
        expect(stdout.trim()).toBe("");
      } finally {
        rmSync(empty, { recursive: true, force: true });
      }
    });
  });

  describe("SessionStart - rules injection", () => {
    it("injects the rules block on startup", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "SessionStart",
        source: "startup",
      });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(output.hookSpecificOutput.additionalContext).toContain("Graphene Context Graph");
      expect(output.hookSpecificOutput.additionalContext).toContain("You MUST record");
    });

    it("injects again after compaction", () => {
      const { stdout } = run({
        session_id: "s1",
        hook_event_name: "SessionStart",
        source: "compact",
      });
      const output = parseOutput(stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain("Graphene Context Graph");
    });

    it("injects even when not in a git repo", () => {
      const noGit = mkdtempSync(join(tmpdir(), "graphene-no-git-ss-"));
      try {
        const { stdout } = run({
          session_id: "s1",
          hook_event_name: "SessionStart",
          source: "startup",
        }, { cwd: noGit });
        const output = parseOutput(stdout);
        expect(output.hookSpecificOutput.additionalContext).toContain("Graphene Context Graph");
      } finally {
        rmSync(noGit, { recursive: true, force: true });
      }
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

  describe("hooks.json PostToolUse matcher", () => {
    it("matches both standalone and plugin graphene tool names", () => {
      const config = JSON.parse(
        readFileSync(join(import.meta.dirname, "../../hooks/hooks.json"), "utf-8")
      );
      const matchers = config.hooks.PostToolUse.map((h: { matcher: string }) => h.matcher);
      const grapheneMatcher = matchers.find((m: string) => m.includes("graphene"));
      expect(grapheneMatcher).toBeTruthy();

      const re = new RegExp(grapheneMatcher);
      expect(re.test("mcp__graphene__learn")).toBe(true);
      expect(re.test("mcp__plugin_graphene_graphene__learn")).toBe(true);
      expect(re.test("mcp__playwright__browser_click")).toBe(false);
      expect(re.test("Bash")).toBe(false);
    });
  });
});
