import { listNodes, readNode, type StoredObservation } from "../store.js";
import { READ_BUDGET } from "../budget.js";
import type { IndexEntry, NodeDetail, ObservationDetail, EdgeWithNeighbor } from "../types.js";

// learn() and batch() refuse writes past READ_BUDGET, but a node can still
// hold more: one that grew before that limit existed, or was edited by hand.
// read(name) then cuts each long observation to a preview instead of
// returning it whole; read(name, id) still returns any one in full.
const PREVIEW_LIMIT = 200;

function preview(obs: StoredObservation): StoredObservation & { truncated?: true } {
  if (obs.content.length <= PREVIEW_LIMIT) return obs;
  return { ...obs, content: obs.content.slice(0, PREVIEW_LIMIT) + "...", truncated: true };
}

export function handleRead(
  repoRoot: string,
  args: Record<string, unknown>
): { nodes: IndexEntry[] } | NodeDetail | ObservationDetail {
  const name = args.name as string | undefined;
  const id = args.id as string | undefined;

  if (!name) {
    if (id) throw new Error("name is required with id");
    const nodes: IndexEntry[] = listNodes(repoRoot).map((n) => {
      const node = readNode(repoRoot, n)!;
      return { name: node.name, type: node.type, summary: node.summary };
    });
    return { nodes };
  }

  const node = readNode(repoRoot, name);
  if (!node) throw new Error(`Node not found: ${name}`);

  if (id) {
    const observation = node.observations.find((o) => o.id === id);
    if (!observation) throw new Error(`Observation not found: ${id} in node ${name}`);
    return { name: node.name, observation };
  }

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

  const totalChars = node.observations.reduce((sum, o) => sum + o.content.length, 0);
  const overBudget = totalChars > READ_BUDGET;
  const observationsNote =
    `This node's ${node.observations.length} observations total ${totalChars} characters, over the ` +
    `${READ_BUDGET}-character read budget, so each one longer than ${PREVIEW_LIMIT} characters is cut to a ` +
    `preview marked truncated. Call read(name, id) for one in full, or search(query) to find the right ones. ` +
    `learn() refuses new observations here until the node is back under budget: split it into nodes by topic ` +
    `and remove superseded observations with remove_observation.`;

  return {
    name: node.name,
    type: node.type,
    summary: node.summary,
    entry_points: node.entry_points,
    covers: node.covers,
    last_commit: node.last_commit,
    metadata: node.metadata,
    ...(overBudget ? { observations_note: observationsNote } : {}),
    observations: overBudget ? node.observations.map(preview) : node.observations,
    edges,
    dependents,
  };
}
