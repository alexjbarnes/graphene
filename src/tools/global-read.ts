import type { GrapheneDatabase } from "../db.js";
import type { Fact } from "../types.js";

export function handleGlobalRead(
  db: GrapheneDatabase,
  args: Record<string, unknown>
): { facts: Fact[] } {
  const category = args.category as string | undefined;
  const subject = args.subject as string | undefined;

  let sql = "SELECT * FROM facts";
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

  const facts = db.prepare(sql).all(...params) as unknown as Fact[];
  return { facts };
}
