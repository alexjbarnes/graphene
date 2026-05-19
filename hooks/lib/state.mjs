import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sessionsDir() {
  return join(homedir(), ".graphene", "sessions");
}

export function getStatePath(sessionId) {
  return join(sessionsDir(), `${sessionId}.json`);
}

export function readState(sessionId) {
  const defaults = {
    status_injected: false,
    last_interaction: null,
    last_write: null,
    session_start: new Date().toISOString(),
  };

  try {
    const raw = readFileSync(getStatePath(sessionId), "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaults;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function writeState(sessionId, state) {
  mkdirSync(sessionsDir(), { recursive: true });
  writeFileSync(getStatePath(sessionId), JSON.stringify(state));
}

export function cleanupStaleSessions() {
  try {
    const dir = sessionsDir();
    const files = readdirSync(dir);
    const now = Date.now();
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const fp = join(dir, file);
        const stat = statSync(fp);
        if (now - stat.mtimeMs > MAX_AGE_MS) {
          unlinkSync(fp);
        }
      } catch {}
    }
  } catch {}
}
