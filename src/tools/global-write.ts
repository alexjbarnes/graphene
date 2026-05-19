import type { GrapheneDatabase } from "../db.js";

export function handleGlobalWrite(
  db: GrapheneDatabase,
  args: Record<string, unknown>
): { category: string; subject: string } {
  const category = args.category as string;
  const subject = args.subject as string;
  const content = args.content as string;

  if (!category || !subject || !content) {
    throw new Error("category, subject, and content are required");
  }

  db.prepare(
    `INSERT INTO facts (category, subject, content)
     VALUES (?, ?, ?)
     ON CONFLICT(category, subject)
     DO UPDATE SET content = excluded.content, updated_at = datetime('now')`
  ).run(category, subject, content);

  return { category, subject };
}
