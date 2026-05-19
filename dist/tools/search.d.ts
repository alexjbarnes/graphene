import type { GrapheneDatabase } from "../db.js";
import type { SearchResult } from "../types.js";
export declare function handleSearch(db: GrapheneDatabase, args: Record<string, unknown>): {
    results: SearchResult[];
};
