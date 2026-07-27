import type { GrapheneDatabase } from "../db.js";

interface ProjectFact {
  id: number;
  category: string;
  subject: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export function handleProjectRead(
  db: GrapheneDatabase,
  repoId: number,
  args: Record<string, unknown>
): { facts: ProjectFact[] } {
  const category = args.category as string | undefined;
  const subject = args.subject as string | undefined;

  const conditions: string[] = ["repo_id = ?"];
  const params: (string | number)[] = [repoId];

  if (category) {
    conditions.push("category = ?");
    params.push(category);
  }
  if (subject) {
    conditions.push("subject = ?");
    params.push(subject);
  }

  const sql =
    "SELECT * FROM project_facts WHERE " +
    conditions.join(" AND ") +
    " ORDER BY category, subject";

  const facts = db.prepare(sql).all(...params) as unknown as ProjectFact[];
  return { facts };
}
