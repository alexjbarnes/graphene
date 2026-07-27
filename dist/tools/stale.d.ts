import type { GrapheneDatabase } from "../db.js";
import type { StaleNode } from "../types.js";
export declare function handleStale(db: GrapheneDatabase, repoId: number, repoRoot: string, _args: Record<string, unknown>): {
    stale_nodes: StaleNode[];
    fresh_count: number;
    total_count: number;
};
