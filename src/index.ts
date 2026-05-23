#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { getRepoRoot } from "./git.js";
import { initSql, openDatabase, initRepoSchema, initGlobalSchema } from "./db.js";
import { createServer } from "./server.js";

await initSql();

let repoRoot: string | null;
try {
  repoRoot = getRepoRoot();
} catch {
  repoRoot = null;
}

let repoDB: import("./db.js").GrapheneDatabase | null = null;
if (repoRoot) {
  repoDB = openDatabase(join(repoRoot, ".graphene", "context.db"));
  initRepoSchema(repoDB);
}

const globalDB = openDatabase(join(homedir(), ".graphene", "global.db"));
initGlobalSchema(globalDB);

const server = createServer({ repoDB, globalDB, repoRoot });
const transport = new StdioServerTransport();

function cleanup() {
  repoDB?.close();
  globalDB.close();
}
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("SIGINT", () => { cleanup(); process.exit(0); });

await server.connect(transport);
