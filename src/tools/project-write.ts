import type { GrapheneDatabase } from "../db.js";

export function handleProjectWrite(
  db: GrapheneDatabase,
  repoId: number,
  args: Record<string, unknown>
): { category: string; subject: string } {
  const category = args.category as string;
  const subject = args.subject as string;
  const content = args.content as string;

  if (!category || !subject || !content) {
    throw new Error("category, subject, and content are required");
  }

  db.prepare(
    `INSERT INTO project_facts (repo_id, category, subject, content)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(repo_id, category, subject)
     DO UPDATE SET content = excluded.content, updated_at = datetime('now')`
  ).run(repoId, category, subject, content);

  return { category, subject };
}
