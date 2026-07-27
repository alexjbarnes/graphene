#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { discoverScopes } from "./scope.js";
import { globalDir } from "./store.js";
import { createServer } from "./server.js";
const scopes = discoverScopes(process.cwd());
const server = createServer({ scopes, globalDir: globalDir() });
const transport = new StdioServerTransport();
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
await server.connect(transport);
//# sourceMappingURL=index.js.map