import type Database from "better-sqlite3";
import type { SearchResult } from "../types.js";

export function handleSearch(
  db: Database.Database,
  args: Record<string, unknown>
): { results: SearchResult[] } {
  const query = args.query as string;
  if (!query) throw new Error("query is required");

  const results: SearchResult[] = [];

  const nodeMatches = db
    .prepare(
      `SELECT n.name, n.type,
              snippet(nodes_fts, 1, '<match>', '</match>', '...', 32) as snippet
       FROM nodes_fts
       JOIN nodes n ON n.rowid = nodes_fts.rowid
       WHERE nodes_fts MATCH ?`
    )
    .all(query) as Array<{
    name: string;
    type: string;
    snippet: string;
  }>;

  for (const m of nodeMatches) {
    results.push({ type: "node", node_name: m.name, snippet: m.snippet });
  }

  const obsMatches = db
    .prepare(
      `SELECT o.node_name,
              snippet(observations_fts, 0, '<match>', '</match>', '...', 32) as snippet,
              o.created_at
       FROM observations_fts
       JOIN observations o ON o.id = observations_fts.rowid
       WHERE observations_fts MATCH ?`
    )
    .all(query) as Array<{
    node_name: string;
    snippet: string;
    created_at: string;
  }>;

  for (const m of obsMatches) {
    results.push({
      type: "observation",
      node_name: m.node_name,
      snippet: m.snippet,
      created_at: m.created_at,
    });
  }

  return { results };
}
