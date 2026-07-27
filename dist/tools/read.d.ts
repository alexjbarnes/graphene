import type { IndexEntry, NodeDetail } from "../types.js";
export declare function handleRead(repoRoot: string, args: Record<string, unknown>): {
    nodes: IndexEntry[];
} | NodeDetail;
