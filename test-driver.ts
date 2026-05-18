import { join } from "node:path";
import { homedir } from "node:os";
import { getRepoRoot } from "./src/git.js";
import { openDatabase, initRepoSchema, initGlobalSchema } from "./src/db.js";
import { handleRead } from "./src/tools/read.js";
import { handleSearch } from "./src/tools/search.js";
import { handleUpsertNode } from "./src/tools/upsert-node.js";
import { handleLearn } from "./src/tools/learn.js";
import { handleLink } from "./src/tools/link.js";
import { handleUnlink } from "./src/tools/unlink.js";
import { handleStale } from "./src/tools/stale.js";
import { handleGlobalRead } from "./src/tools/global-read.js";
import { handleGlobalWrite } from "./src/tools/global-write.js";
import { handleRemoveObservation } from "./src/tools/remove-observation.js";
import { handleDeleteNode } from "./src/tools/delete-node.js";
import { handleBatch } from "./src/tools/batch.js";
import { handleStatus } from "./src/tools/status.js";

const repoRoot = getRepoRoot(process.env.REPO_PATH);
const repoDB = openDatabase(join(repoRoot, ".graphene", "context.db"));
initRepoSchema(repoDB);
const globalDB = openDatabase(join(homedir(), ".graphene", "global.db"));
initGlobalSchema(globalDB);

const tool = process.argv[2];
const argsJson = process.argv[3] || "{}";
const args = JSON.parse(argsJson);

const handlers: Record<string, (a: Record<string, unknown>) => unknown> = {
  read: (a) => handleRead(repoDB, a),
  search: (a) => handleSearch(repoDB, a),
  upsert_node: (a) => handleUpsertNode(repoDB, a),
  learn: (a) => handleLearn(repoDB, a),
  link: (a) => handleLink(repoDB, a),
  unlink: (a) => handleUnlink(repoDB, a),
  stale: (a) => handleStale(repoDB, repoRoot, a),
  global_read: (a) => handleGlobalRead(globalDB, a),
  global_write: (a) => handleGlobalWrite(globalDB, a),
  remove_observation: (a) => handleRemoveObservation(repoDB, a),
  delete_node: (a) => handleDeleteNode(repoDB, a),
  batch: (a) => handleBatch(repoDB, a),
  status: (a) => handleStatus(repoDB, globalDB, repoRoot, a),
};

const handler = handlers[tool];
if (!handler) {
  console.error(`Unknown tool: ${tool}. Available: ${Object.keys(handlers).join(", ")}`);
  process.exit(1);
}

try {
  const result = handler(args);
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

repoDB.close();
globalDB.close();
