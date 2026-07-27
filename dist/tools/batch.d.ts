import type { GrapheneDatabase } from "../db.js";
interface BatchResult {
    nodes_created: number;
    nodes_updated: number;
    edges_created: number;
    observations_added: number;
}
export declare function handleBatch(db: GrapheneDatabase, repoId: number, args: Record<string, unknown>): BatchResult;
export {};
