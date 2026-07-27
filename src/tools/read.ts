import { listNodes, readNode } from "../store.js";
import type { IndexEntry, NodeDetail, EdgeWithNeighbor } from "../types.js";

export function handleRead(
  repoRoot: string,
  args: Record<string, unknown>
): { nodes: IndexEntry[] } | NodeDetail {
  const name = args.name as string | undefined;

  if (!name) {
    const nodes: IndexEntry[] = listNodes(repoRoot).map((n) => {
      const node = readNode(repoRoot, n)!;
      return { name: node.name, type: node.type, summary: node.summary };
    });
    return { nodes };
  }

  const node = readNode(repoRoot, name);
  if (!node) throw new Error(`Node not found: ${name}`);

  const edges: EdgeWithNeighbor[] = node.edges.map((e) => {
    const neighbor = readNode(repoRoot, e.to);
    return { node: e.to, type: e.type, reason: e.reason, summary: neighbor?.summary ?? null };
  });

  // No reverse index exists on disk: finding dependents means scanning every
  // other node's own outgoing edges for one pointing back at `name`.
  const dependents: EdgeWithNeighbor[] = [];
  for (const otherName of listNodes(repoRoot)) {
    if (otherName === name) continue;
    const other = readNode(repoRoot, otherName);
    if (!other) continue;
    for (const e of other.edges) {
      if (e.to === name) {
        dependents.push({ node: otherName, type: e.type, reason: e.reason, summary: other.summary });
      }
    }
  }

  return {
    name: node.name,
    type: node.type,
    summary: node.summary,
    entry_points: node.entry_points,
    covers: node.covers,
    last_commit: node.last_commit,
    metadata: node.metadata,
    observations: node.observations,
    edges,
    dependents,
  };
}
