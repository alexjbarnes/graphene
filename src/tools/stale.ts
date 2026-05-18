import type Database from "better-sqlite3";
import type { StaleNode } from "../types.js";
import { getChangedFiles } from "../git.js";

export function handleStale(
  db: Database.Database,
  repoRoot: string,
  _args: Record<string, unknown>
): { stale_nodes: StaleNode[]; fresh_count: number; total_count: number } {
  const nodes = db
    .prepare("SELECT name, covers, last_commit FROM nodes")
    .all() as Array<{
    name: string;
    covers: string;
    last_commit: string | null;
  }>;

  const staleNodes: StaleNode[] = [];
  let freshCount = 0;

  for (const node of nodes) {
    const covers: string[] = JSON.parse(node.covers || "[]");

    if (!node.last_commit) {
      staleNodes.push({ name: node.name, reason: "untracked", changed_files: [] });
      continue;
    }

    if (covers.length === 0) {
      freshCount++;
      continue;
    }

    const changed = getChangedFiles(repoRoot, node.last_commit, covers);
    if (changed.length > 0) {
      staleNodes.push({ name: node.name, reason: "changed", changed_files: changed });
    } else {
      freshCount++;
    }
  }

  return {
    stale_nodes: staleNodes,
    fresh_count: freshCount,
    total_count: nodes.length,
  };
}
