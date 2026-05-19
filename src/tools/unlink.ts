import type { GrapheneDatabase } from "../db.js";
import { BIDIRECTIONAL_EDGE_TYPES } from "../types.js";

export function handleUnlink(
  db: GrapheneDatabase,
  args: Record<string, unknown>
): { removed: number } {
  const from = args.from as string;
  const to = args.to as string;
  const type = (args.type as string) ?? null;

  if (!from || !to) throw new Error("from and to are required");

  let removed = 0;

  db.transaction(() => {
    if (type) {
      const r1 = db
        .prepare("DELETE FROM edges WHERE from_node = ? AND to_node = ? AND type = ?")
        .run(from, to, type);
      removed += r1.changes;

      if (BIDIRECTIONAL_EDGE_TYPES.has(type)) {
        const r2 = db
          .prepare("DELETE FROM edges WHERE from_node = ? AND to_node = ? AND type = ?")
          .run(to, from, type);
        removed += r2.changes;
      }
    } else {
      const r1 = db
        .prepare("DELETE FROM edges WHERE from_node = ? AND to_node = ?")
        .run(from, to);
      removed += r1.changes;

      const r2 = db
        .prepare("DELETE FROM edges WHERE from_node = ? AND to_node = ?")
        .run(to, from);
      removed += r2.changes;
    }
  })();

  return { removed };
}
