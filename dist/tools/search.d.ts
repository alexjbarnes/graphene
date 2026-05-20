import type { GrapheneDatabase } from "../db.js";
import type { SearchResult } from "../types.js";
export declare function handleSearch(repoDB: GrapheneDatabase, globalDB: GrapheneDatabase, args: Record<string, unknown>): {
    results: SearchResult[];
};
