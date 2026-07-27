import type { GrapheneDatabase } from "../db.js";
import type { SearchResult } from "../types.js";
export declare function handleSearch(db: GrapheneDatabase, repoId: number, args: Record<string, unknown>): {
    results: SearchResult[];
};
