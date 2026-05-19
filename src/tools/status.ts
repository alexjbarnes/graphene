import type { GrapheneDatabase } from "../db.js";
import type { IndexEntry, Fact, StaleNode } from "../types.js";
import { getChangedFiles, getHead } from "../git.js";

interface StatusResult {
  head: string;
  nodes: IndexEntry[];
  stale_nodes: StaleNode[];
  facts: Fact[];
}

export function handleStatus(
  repoDB: GrapheneDatabase,
  globalDB: GrapheneDatabase,
  repoRoot: string,
  _args: Record<string, unknown>
): StatusResult {
  const head = getHead(repoRoot);

  const nodes = repoDB
    .prepare("SELECT name, type, summary FROM nodes ORDER BY name")
    .all() as unknown as IndexEntry[];

  const allNodes = repoDB
    .prepare("SELECT name, covers, last_commit FROM nodes")
    .all() as Array<{
    name: string;
    covers: string;
    last_commit: string | null;
  }>;

  const staleNodes: StaleNode[] = [];
  for (const node of allNodes) {
    const covers: string[] = JSON.parse(node.covers || "[]");

    if (!node.last_commit) {
      staleNodes.push({ name: node.name, reason: "untracked", changed_files: [] });
      continue;
    }

    if (covers.length === 0) continue;

    const changed = getChangedFiles(repoRoot, node.last_commit, covers);
    if (changed.length > 0) {
      staleNodes.push({ name: node.name, reason: "changed", changed_files: changed });
    }
  }

  const facts = globalDB
    .prepare("SELECT * FROM facts ORDER BY category, subject")
    .all() as unknown as Fact[];

  return { head, nodes, stale_nodes: staleNodes, facts };
}
