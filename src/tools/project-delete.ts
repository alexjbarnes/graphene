import type { GrapheneDatabase } from "../db.js";

export function handleProjectDelete(
  db: GrapheneDatabase,
  repoId: number,
  args: Record<string, unknown>
): { deleted: boolean } {
  const category = args.category as string;
  const subject = args.subject as string;

  if (!category || !subject) {
    throw new Error("category and subject are required");
  }

  const result = db
    .prepare("DELETE FROM project_facts WHERE repo_id = ? AND category = ? AND subject = ?")
    .run(repoId, category, subject);

  return { deleted: result.changes > 0 };
}
