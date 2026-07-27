import type { GrapheneDatabase } from "../db.js";

export function handleRemoveObservation(
  db: GrapheneDatabase,
  repoId: number,
  args: Record<string, unknown>
): { removed: boolean } {
  const id = args.id as number | undefined;

  if (id === undefined) throw new Error("id is required");

  const result = db
    .prepare("DELETE FROM observations WHERE repo_id = ? AND id = ?")
    .run(repoId, id);

  return { removed: result.changes > 0 };
}
