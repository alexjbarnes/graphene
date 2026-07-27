#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { getRepoRoot, getRemoteUrl } from "./git.js";
import { openDatabase, initSchema, ensureRepo } from "./db.js";
import { migrateRepo, migrateGlobal } from "./migrate.js";
import { createServer } from "./server.js";
let repoRoot;
try {
    repoRoot = getRepoRoot();
}
catch {
    repoRoot = null;
}
const db = openDatabase(join(homedir(), ".graphene", "graphene.db"));
initSchema(db);
migrateGlobal(db);
let repoId = null;
if (repoRoot) {
    repoId = ensureRepo(db, repoRoot, getRemoteUrl(repoRoot));
    migrateRepo(db, repoId, repoRoot);
}
const server = createServer({ db, repoId, repoRoot });
const transport = new StdioServerTransport();
function cleanup() {
    db.close();
}
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("SIGINT", () => { cleanup(); process.exit(0); });
await server.connect(transport);
//# sourceMappingURL=index.js.map