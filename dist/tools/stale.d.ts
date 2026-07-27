import type { StaleNode } from "../types.js";
export declare function handleStale(repoRoot: string, _args: Record<string, unknown>): {
    stale_nodes: StaleNode[];
    fresh_count: number;
    total_count: number;
};
