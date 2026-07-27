import { readNode, writeNode } from "../store.js";

export function handleRemoveObservation(
  repoRoot: string,
  args: Record<string, unknown>
): { removed: boolean } {
  const nodeName = args.node_name as string;
  const id = args.id as string;

  if (!nodeName) throw new Error("node_name is required");
  if (!id) throw new Error("id is required");

  const node = readNode(repoRoot, nodeName);
  if (!node) throw new Error(`Node not found: ${nodeName}`);

  const observations = node.observations.filter((o) => o.id !== id);
  const removed = observations.length !== node.observations.length;

  if (removed) {
    writeNode(repoRoot, { ...node, observations });
  }

  return { removed };
}
