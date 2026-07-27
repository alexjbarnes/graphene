import type { SearchResult } from "../types.js";
export declare function handleSearch(repoRoot: string, globalDirPath: string, args: Record<string, unknown>): {
    results: SearchResult[];
    omitted?: number;
};
