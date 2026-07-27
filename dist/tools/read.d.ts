import type { GrapheneDatabase } from "../db.js";
import type { IndexEntry, NodeDetail } from "../types.js";
export declare function handleRead(db: GrapheneDatabase, repoId: number, args: Record<string, unknown>): {
    nodes: IndexEntry[];
} | NodeDetail;
