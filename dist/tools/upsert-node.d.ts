import type { GrapheneDatabase } from "../db.js";
interface UpsertResult {
    name: string;
    status: "created" | "updated" | "unchanged";
    fields_updated?: string[];
}
export declare function handleUpsertNode(db: GrapheneDatabase, args: Record<string, unknown>): UpsertResult;
export {};
