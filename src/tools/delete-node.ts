import type { GrapheneDatabase } from "../db.js";

export function handleDeleteNode(
  db: GrapheneDatabase,
  args: Record<string, unknown>
): { deleted: boolean } {
  const name = args.name as string;

  if (!name) throw new Error("name is required");

  const result = db
    .prepare("DELETE FROM nodes WHERE name = ?")
    .run(name);

  return { deleted: result.changes > 0 };
}
