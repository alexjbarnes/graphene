import { listNodes, readNode, writeNode, deleteNodeFile } from "../store.js";

export function handleDeleteNode(
  repoRoot: string,
  args: Record<string, unknown>
): { deleted: boolean } {
  const name = args.name as string;

  if (!name) throw new Error("name is required");

  const deleted = deleteNodeFile(repoRoot, name);

  if (deleted) {
    for (const otherName of listNodes(repoRoot)) {
      const other = readNode(repoRoot, otherName);
      if (!other) continue;
      const edges = other.edges.filter((e) => e.to !== name);
      if (edges.length !== other.edges.length) {
        writeNode(repoRoot, { ...other, edges });
      }
    }
  }

  return { deleted };
}
