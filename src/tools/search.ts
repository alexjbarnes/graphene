import type { GrapheneDatabase } from "../db.js";
import type { SearchResult } from "../types.js";

function scoreMatch(text: string, words: string[]): number {
  const lower = text.toLowerCase();
  return words.filter(w => lower.includes(w.toLowerCase())).length;
}

export function handleSearch(
  db: GrapheneDatabase,
  repoId: number,
  args: Record<string, unknown>
): { results: SearchResult[] } {
  const query = args.query as string;
  if (!query) throw new Error("query is required");

  const words = query.split(/\s+/).filter(Boolean);
  if (words.length === 0) throw new Error("query is required");

  const results: SearchResult[] = [];
  const patterns = words.map(w => `%${w}%`);

  const nodeWhere = words.map(() => "(name LIKE ? OR summary LIKE ?)").join(" OR ");
  const nodeParams = patterns.flatMap(p => [p, p]);
  const nodeMatches = db
    .prepare(`SELECT name, type, summary FROM nodes WHERE repo_id = ? AND (${nodeWhere})`)
    .all(repoId, ...nodeParams) as unknown as Array<{ name: string; type: string; summary: string | null }>;

  for (const m of nodeMatches) {
    results.push({
      type: "node",
      node_name: m.name,
      snippet: m.summary ?? m.name,
      score: scoreMatch(`${m.name} ${m.summary || ""}`, words),
    });
  }

  const obsWhere = words.map(() => "o.content LIKE ?").join(" OR ");
  const obsMatches = db
    .prepare(`SELECT o.node_name, o.content, o.created_at FROM observations o WHERE o.repo_id = ? AND (${obsWhere})`)
    .all(repoId, ...patterns) as unknown as Array<{ node_name: string; content: string; created_at: string }>;

  for (const m of obsMatches) {
    results.push({
      type: "observation",
      node_name: m.node_name,
      snippet: m.content,
      created_at: m.created_at,
      score: scoreMatch(m.content, words),
    });
  }

  const factWhere = words.map(() => "(category LIKE ? OR subject LIKE ? OR content LIKE ?)").join(" OR ");
  const factParams = patterns.flatMap(p => [p, p, p]);

  const projectFacts = db
    .prepare(`SELECT category, subject, content FROM project_facts WHERE repo_id = ? AND (${factWhere})`)
    .all(repoId, ...factParams) as unknown as Array<{ category: string; subject: string; content: string }>;

  for (const f of projectFacts) {
    results.push({
      type: "project_fact",
      node_name: `${f.category}/${f.subject}`,
      snippet: f.content,
      score: scoreMatch(`${f.category} ${f.subject} ${f.content}`, words),
    });
  }

  const globalFacts = db
    .prepare(`SELECT category, subject, content FROM facts WHERE ${factWhere}`)
    .all(...factParams) as unknown as Array<{ category: string; subject: string; content: string }>;

  for (const f of globalFacts) {
    results.push({
      type: "global_fact",
      node_name: `${f.category}/${f.subject}`,
      snippet: f.content,
      score: scoreMatch(`${f.category} ${f.subject} ${f.content}`, words),
    });
  }

  const edgeWhere = words.map(() => "reason LIKE ?").join(" OR ");
  const edgeMatches = db
    .prepare(`SELECT from_node, to_node, type, reason FROM edges WHERE repo_id = ? AND reason IS NOT NULL AND (${edgeWhere})`)
    .all(repoId, ...patterns) as unknown as Array<{ from_node: string; to_node: string; type: string; reason: string }>;

  for (const e of edgeMatches) {
    results.push({
      type: "edge",
      node_name: `${e.from_node} -> ${e.to_node}`,
      snippet: `[${e.type}] ${e.reason}`,
      score: scoreMatch(e.reason, words),
    });
  }

  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return { results };
}
