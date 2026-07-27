import { type StoredNode } from "../store.js";
export declare function upsertEdge(node: StoredNode, to: string, type: string, reason: string | null): StoredNode;
export declare function handleLink(repoRoot: string, args: Record<string, unknown>): {
    from: string;
    to: string;
    type: string;
    bidirectional: boolean;
};
