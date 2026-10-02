import type { IndexEntry, NodeDetail, ObservationDetail } from "../types.js";
export declare function handleRead(repoRoot: string, args: Record<string, unknown>): {
    nodes: IndexEntry[];
} | NodeDetail | ObservationDetail;
