import type { GrapheneDatabase } from "../db.js";

export function handleLearn(
  db: GrapheneDatabase,
  repoId: number,
  args: Record<string, unknown>
): { id: number; node_name: string } {
  const nodeName = args.node_name as string;
  const content = args.content as string;
  const source = (args.source as string) ?? null;

  if (!nodeName) throw new Error("node_name is required");
  if (!content) throw new Error("content is required");

  const exists = db
    .prepare("SELECT 1 FROM nodes WHERE repo_id = ? AND name = ?")
    .get(repoId, nodeName);
  if (!exists) throw new Error(`Node not found: ${nodeName}`);

  const result = db
    .prepare(
      "INSERT INTO observations (repo_id, node_name, content, source) VALUES (?, ?, ?, ?)"
    )
    .run(repoId, nodeName, content, source);

  return { id: Number(result.lastInsertRowid), node_name: nodeName };
}
