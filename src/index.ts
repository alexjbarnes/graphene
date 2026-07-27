#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { discoverScopes } from "./scope.js";
import { globalDir } from "./store.js";
import { createServer } from "./server.js";
import { exportGlobals, importGlobals } from "./globals-sync.js";

const cliArgs = process.argv.slice(2);

if (cliArgs.length > 0) {
  runCli(cliArgs);
} else {
  const scopes = discoverScopes(process.cwd());

  const server = createServer({ scopes, globalDir: globalDir() });
  const transport = new StdioServerTransport();

  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));

  await server.connect(transport);
}

// Sets a non-zero exit code without forcing an immediate exit: process.exit()
// can truncate stdout/stderr when they are piped (e.g. under execFileSync),
// since pipe writes are asynchronous on POSIX. Setting process.exitCode and
// returning lets the process end naturally once nothing is left pending,
// which flushes output first.
function printUsage(): void {
  console.error("Usage: graphene globals export <path>\n       graphene globals import <path> [--overwrite]");
  process.exitCode = 1;
}

// `graphene globals export <path>` and `graphene globals import <path>
// [--overwrite]` run against the real globalDir() and print a one-line
// human-readable result. Any other shape (unknown subcommand, missing path)
// prints usage to stderr and exits 1.
function runCli(args: string[]): void {
  const [group, action, path, ...rest] = args;

  if (group !== "globals" || (action !== "export" && action !== "import") || path === undefined) {
    printUsage();
    return;
  }

  if (action === "export") {
    const { count } = exportGlobals(globalDir(), path);
    console.log(`Exported ${count} global facts to ${path}`);
  } else {
    const overwrite = rest.includes("--overwrite");
    const { imported, unchanged, overwritten, skipped } = importGlobals(globalDir(), path, overwrite);
    const skippedClause =
      skipped.length > 0 ? ` Skipped ${skipped.length} (kept local): ${skipped.join(", ")}` : "";
    console.log(`Imported ${imported}, unchanged ${unchanged}, overwritten ${overwritten}.${skippedClause}`);
  }
}
