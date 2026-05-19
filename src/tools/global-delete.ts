import type { GrapheneDatabase } from "../db.js";

export function handleGlobalDelete(
  db: GrapheneDatabase,
  args: Record<string, unknown>
): { deleted: boolean } {
  const category = args.category as string;
  const subject = args.subject as string;

  if (!category || !subject) {
    throw new Error("category and subject are required");
  }

  const result = db
    .prepare("DELETE FROM facts WHERE category = ? AND subject = ?")
    .run(category, subject);

  return { deleted: result.changes > 0 };
}
