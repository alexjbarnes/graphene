import type { GrapheneDatabase } from "../db.js";
import type { SearchResult } from "../types.js";

export function handleSearch(
  db: GrapheneDatabase,
  args: Record<string, unknown>
): { results: SearchResult[] } {
  const query = args.query as string;
  if (!query) throw new Error("query is required");

  const pattern = `%${query}%`;
  const results: SearchResult[] = [];

  const nodeMatches = db
    .prepare(
      `SELECT name, type, summary
       FROM nodes
       WHERE name LIKE ? OR summary LIKE ?`
    )
    .all(pattern, pattern) as Array<{
    name: string;
    type: string;
    summary: string | null;
  }>;

  for (const m of nodeMatches) {
    results.push({ type: "node", node_name: m.name, snippet: m.summary ?? m.name });
  }

  const obsMatches = db
    .prepare(
      `SELECT o.node_name, o.content, o.created_at
       FROM observations o
       WHERE o.content LIKE ?`
    )
    .all(pattern) as Array<{
    node_name: string;
    content: string;
    created_at: string;
  }>;

  for (const m of obsMatches) {
    results.push({
      type: "observation",
      node_name: m.node_name,
      snippet: m.content,
      created_at: m.created_at,
    });
  }

  return { results };
}
