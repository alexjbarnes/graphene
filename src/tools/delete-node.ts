import type { GrapheneDatabase } from "../db.js";

export function handleDeleteNode(
  db: GrapheneDatabase,
  repoId: number,
  args: Record<string, unknown>
): { deleted: boolean } {
  const name = args.name as string;

  if (!name) throw new Error("name is required");

  const result = db
    .prepare("DELETE FROM nodes WHERE repo_id = ? AND name = ?")
    .run(repoId, name);

  return { deleted: result.changes > 0 };
}
