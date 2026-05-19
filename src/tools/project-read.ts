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
  args: Record<string, unknown>
): { facts: ProjectFact[] } {
  const category = args.category as string | undefined;
  const subject = args.subject as string | undefined;

  let sql = "SELECT * FROM project_facts";
  const conditions: string[] = [];
  const params: string[] = [];

  if (category) {
    conditions.push("category = ?");
    params.push(category);
  }
  if (subject) {
    conditions.push("subject = ?");
    params.push(subject);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY category, subject";

  const facts = db.prepare(sql).all(...params) as unknown as ProjectFact[];
  return { facts };
}
