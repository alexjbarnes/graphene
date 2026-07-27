// THE GATE TEST: proves learn()'s append-only design (readNode +
// observationId + appendLineVerified, never a whole-file read-modify-write)
// does not lose observations when two separate OS processes hammer the same
// node file at once. A naive "read node, push an observation, writeNode the
// whole file back" implementation would race here: whichever writer's
// writeFileAtomic lands last would silently discard the other's addition,
// and this test would come up short of 20 observations.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { writeNode, readNode } from "../src/store.js";

const REPO_ROOT = join(import.meta.dirname, "..");
// Requires `dist/store.js` to already be built (this project's standard
// workflow is build-then-test). Deliberately does not run tsc itself here:
// e2e.test.ts already does that in a beforeAll, and vitest runs test files
// in parallel by default, so a second concurrent tsc invocation writing the
// same dist/ output would race against it.
const DIST_STORE_URL = pathToFileURL(join(REPO_ROOT, "dist", "store.js")).href;

// Built as a source string (not a file) so every value is embedded as a safe
// JS literal via JSON.stringify -- no reliance on `-e` script argv indexing.
function childScript(repoRoot: string, nodeName: string, workerLabel: string, count: number): string {
  return `
(async () => {
  const { readNode, appendLineVerified, observationId, nodePath } = await import(${JSON.stringify(DIST_STORE_URL)});
  const repoRoot = ${JSON.stringify(repoRoot)};
  const name = ${JSON.stringify(nodeName)};
  for (let i = 0; i < ${count}; i++) {
    const content = ${JSON.stringify(workerLabel)} + "-" + i;
    const node = readNode(repoRoot, name);
    const existingIds = new Set(node.observations.map((o) => o.id));
    const id = observationId(content, existingIds);
    const line = "- " + content + " <!-- id:" + id + " -->\\n";
    appendLineVerified(nodePath(repoRoot, name), line, "id:" + id);
  }
})().catch((err) => { console.error(err); process.exit(1); });
`;
}

function runChild(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`child exited with code ${code}: ${stderr}`));
    });
  });
}

describe("concurrency: concurrent learn()-equivalent appends", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "graphene-concurrency-"));
    writeNode(repoRoot, {
      name: "shared",
      type: "subsystem",
      summary: null,
      entry_points: [],
      covers: [],
      last_commit: null,
      metadata: {},
      edges: [],
      observations: [],
    });
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("parses exactly 20 unique, uncorrupted observations after two concurrent 10-write bursts", async () => {
    const workerA = childScript(repoRoot, "shared", "workerA", 10);
    const workerB = childScript(repoRoot, "shared", "workerB", 10);

    await Promise.all([runChild(workerA), runChild(workerB)]);

    const node = readNode(repoRoot, "shared")!;
    expect(node.observations).toHaveLength(20);

    const ids = node.observations.map((o) => o.id);
    expect(new Set(ids).size).toBe(20);

    const contents = node.observations.map((o) => o.content).sort();
    const expected = [
      ...Array.from({ length: 10 }, (_, i) => `workerA-${i}`),
      ...Array.from({ length: 10 }, (_, i) => `workerB-${i}`),
    ].sort();
    expect(contents).toEqual(expected);
  }, 30000);
});
