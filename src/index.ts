#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getRepoRoot } from "./git.js";
import { globalDir } from "./store.js";
import { createServer } from "./server.js";

let repoRoot: string | null;
try {
  repoRoot = getRepoRoot();
} catch {
  repoRoot = null;
}

const server = createServer({ repoRoot, globalDir: globalDir() });
const transport = new StdioServerTransport();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

await server.connect(transport);
