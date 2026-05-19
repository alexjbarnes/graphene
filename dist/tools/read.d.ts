import type Database from "better-sqlite3";
import type { IndexEntry, NodeDetail } from "../types.js";
export declare function handleRead(db: Database.Database, args: Record<string, unknown>): {
    nodes: IndexEntry[];
} | NodeDetail;
