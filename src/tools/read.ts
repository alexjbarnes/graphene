import type { GrapheneDatabase } from "../db.js";
import type { IndexEntry, NodeDetail, EdgeWithNeighbor } from "../types.js";

export function handleRead(
  db: GrapheneDatabase,
  args: Record<string, unknown>
): { nodes: IndexEntry[] } | NodeDetail {
  const name = args.name as string | undefined;

  if (!name) {
    const rows = db
      .prepare("SELECT name, type, summary FROM nodes ORDER BY name")
      .all() as unknown as IndexEntry[];
    return { nodes: rows };
  }

  const node = db.prepare("SELECT * FROM nodes WHERE name = ?").get(name) as
    | Record<string, unknown>
    | undefined;

  if (!node) throw new Error(`Node not found: ${name}`);

  const outgoing = db
    .prepare(
      `SELECT e.to_node as node, e.type, e.reason, n.summary
       FROM edges e
       JOIN nodes n ON n.name = e.to_node
       WHERE e.from_node = ?`
    )
    .all(name) as unknown as EdgeWithNeighbor[];

  const incoming = db
    .prepare(
      `SELECT e.from_node as node, e.type, e.reason, n.summary
       FROM edges e
       JOIN nodes n ON n.name = e.from_node
       WHERE e.to_node = ?`
    )
    .all(name) as unknown as EdgeWithNeighbor[];

  const observations = db
    .prepare(
      `SELECT id, content, source, created_at FROM observations
       WHERE node_name = ? ORDER BY created_at`
    )
    .all(name) as Array<{
    id: number;
    content: string;
    source: string | null;
    created_at: string;
  }>;

  return {
    name: node.name as string,
    type: node.type as string,
    summary: node.summary as string | null,
    entry_points: JSON.parse((node.entry_points as string) || "[]"),
    covers: JSON.parse((node.covers as string) || "[]"),
    last_commit: node.last_commit as string | null,
    metadata: JSON.parse((node.metadata as string) || "{}"),
    observations,
    edges: outgoing,
    dependents: incoming,
  };
}
