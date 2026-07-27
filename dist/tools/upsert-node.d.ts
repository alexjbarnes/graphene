import type { GrapheneDatabase } from "../db.js";
interface UpsertResult {
    name: string;
    status: "created" | "updated";
    fields_updated?: string[];
}
export declare function handleUpsertNode(db: GrapheneDatabase, repoId: number, args: Record<string, unknown>): UpsertResult;
export {};
