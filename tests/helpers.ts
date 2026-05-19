import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { initSql, openMemoryDatabase, initRepoSchema, initGlobalSchema, type GrapheneDatabase } from "../src/db.js";

let initialized = false;

async function ensureInit() {
  if (!initialized) {
    await initSql();
    initialized = true;
  }
}

export async function createTestRepoDb(): Promise<GrapheneDatabase> {
  await ensureInit();
  const db = openMemoryDatabase();
  initRepoSchema(db);
  return db;
}

export async function createTestGlobalDb(): Promise<GrapheneDatabase> {
  await ensureInit();
  const db = openMemoryDatabase();
  initGlobalSchema(db);
  return db;
}

export interface TestRepo {
  path: string;
  cleanup: () => void;
  commit: (message: string) => string;
  writeFile: (name: string, content: string) => void;
}

export function createTestGitRepo(): TestRepo {
  const path = mkdtempSync(join(tmpdir(), "graphene-test-"));
  execSync("git init", { cwd: path, stdio: "ignore" });
  execSync("git config user.email test@test.com", { cwd: path, stdio: "ignore" });
  execSync("git config user.name Test", { cwd: path, stdio: "ignore" });
  execSync("git commit --allow-empty -m init", { cwd: path, stdio: "ignore" });

  return {
    path,
    cleanup: () => rmSync(path, { recursive: true, force: true }),
    commit(message: string): string {
      execSync(`git add -A && git commit -m "${message}"`, {
        cwd: path,
        stdio: "ignore",
      });
      return execSync("git rev-parse HEAD", {
        cwd: path,
        encoding: "utf-8",
      }).trim();
    },
    writeFile(name: string, content: string): void {
      mkdirSync(join(path, dirname(name)), { recursive: true });
      writeFileSync(join(path, name), content);
    },
  };
}
