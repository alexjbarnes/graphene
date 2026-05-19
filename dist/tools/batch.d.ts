import type Database from "better-sqlite3";
interface BatchResult {
    nodes_created: number;
    nodes_updated: number;
    edges_created: number;
    observations_added: number;
}
export declare function handleBatch(db: Database.Database, args: Record<string, unknown>): BatchResult;
export {};
