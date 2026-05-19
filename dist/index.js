#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { getRepoRoot } from "./git.js";
import { openDatabase, initRepoSchema, initGlobalSchema } from "./db.js";
import { createServer } from "./server.js";
let repoRoot;
try {
    repoRoot = getRepoRoot();
}
catch {
    repoRoot = null;
}
let repoDB = null;
if (repoRoot) {
    repoDB = openDatabase(join(repoRoot, ".graphene", "context.db"));
    initRepoSchema(repoDB);
}
const globalDB = openDatabase(join(homedir(), ".graphene", "global.db"));
initGlobalSchema(globalDB);
const server = createServer({ repoDB, globalDB, repoRoot });
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map