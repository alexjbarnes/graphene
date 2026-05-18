import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, readdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const originalHome = process.env.HOME;
let tempHome: string;

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "graphene-test-"));
  process.env.HOME = tempHome;
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(tempHome, { recursive: true, force: true });
});

import { readState, writeState, cleanupStaleSessions, getStatePath } from "../../hooks/lib/state.mjs";

describe("state module", () => {
  it("returns defaults when no state file exists", () => {
    const state = readState("test-session");
    expect(state.status_called).toBe(false);
    expect(state.last_interaction).toBeNull();
    expect(state.last_write).toBeNull();
    expect(state.session_start).toBeTruthy();
  });

  it("writes and reads state", () => {
    const state = {
      status_called: true,
      last_interaction: "2026-01-01T00:00:00.000Z",
      last_write: "2026-01-01T00:00:00.000Z",
      session_start: "2026-01-01T00:00:00.000Z",
    };
    writeState("test-session", state);
    const loaded = readState("test-session");
    expect(loaded.status_called).toBe(true);
    expect(loaded.last_write).toBe("2026-01-01T00:00:00.000Z");
  });

  it("creates sessions directory if missing", () => {
    const sessionsDir = join(tempHome, ".graphene", "sessions");
    expect(existsSync(sessionsDir)).toBe(false);
    writeState("test-session", { status_called: false });
    expect(existsSync(sessionsDir)).toBe(true);
  });

  it("handles corrupted state file", () => {
    const sessionsDir = join(tempHome, ".graphene", "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, "bad-session.json"), "not json{{{");
    const state = readState("bad-session");
    expect(state.status_called).toBe(false);
  });

  it("cleans up old session files", () => {
    writeState("old-session", { status_called: true });
    writeState("new-session", { status_called: true });

    const oldPath = getStatePath("old-session");
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    utimesSync(oldPath, past, past);

    cleanupStaleSessions();

    const sessionsDir = join(tempHome, ".graphene", "sessions");
    const files = readdirSync(sessionsDir);
    expect(files).toContain("new-session.json");
    expect(files).not.toContain("old-session.json");
  });
});
