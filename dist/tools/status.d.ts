import type Database from "better-sqlite3";
import type { IndexEntry, Fact, StaleNode } from "../types.js";
interface StatusResult {
    head: string;
    nodes: IndexEntry[];
    stale_nodes: StaleNode[];
    facts: Fact[];
}
export declare function handleStatus(repoDB: Database.Database, globalDB: Database.Database, repoRoot: string, _args: Record<string, unknown>): StatusResult;
export {};
