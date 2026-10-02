import { listNodes, readNode, nodeGitPath } from "../store.js";
import type { StaleNode } from "../types.js";
import { getUnreviewedFiles } from "../git.js";

export function handleStale(
  repoRoot: string,
  _args: Record<string, unknown>
): { stale_nodes: StaleNode[]; fresh_count: number; total_count: number } {
  const names = listNodes(repoRoot);
  const staleNodes: StaleNode[] = [];
  let freshCount = 0;

  for (const name of names) {
    const node = readNode(repoRoot, name);
    if (!node) continue;

    if (!node.last_commit) {
      staleNodes.push({ name: node.name, reason: "untracked", changed_files: [] });
      continue;
    }

    if (node.covers.length === 0) {
      freshCount++;
      continue;
    }

    const changed = getUnreviewedFiles(repoRoot, node.last_commit, node.covers, nodeGitPath(node.name));
    if (changed.length > 0) {
      staleNodes.push({ name: node.name, reason: "changed", changed_files: changed });
    } else {
      freshCount++;
    }
  }

  return {
    stale_nodes: staleNodes,
    fresh_count: freshCount,
    total_count: names.length,
  };
}
