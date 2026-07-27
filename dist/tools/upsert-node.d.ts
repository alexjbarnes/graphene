import { type StoredNode } from "../store.js";
export interface UpsertNodeParams {
    name: string;
    type?: string;
    summary?: string;
    entry_points?: string[];
    covers?: string[];
    last_commit?: string;
    metadata?: Record<string, unknown>;
}
interface UpsertResult {
    name: string;
    status: "created" | "updated";
    fields_updated?: string[];
}
export declare function normalizeArgs(args: Record<string, unknown>): Record<string, unknown>;
export declare function applyUpsert(existing: StoredNode | null, params: UpsertNodeParams): {
    node: StoredNode;
    status: "created" | "updated";
    fields_updated?: string[];
};
export declare function handleUpsertNode(repoRoot: string, args: Record<string, unknown>): UpsertResult;
export {};
