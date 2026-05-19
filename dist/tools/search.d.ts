import type Database from "better-sqlite3";
import type { SearchResult } from "../types.js";
export declare function handleSearch(db: Database.Database, args: Record<string, unknown>): {
    results: SearchResult[];
};
