import { type StoredFact } from "./store.js";
export declare function serializeBundle(facts: StoredFact[]): string;
export declare function parseBundle(text: string): StoredFact[];
export declare function exportGlobals(globalDirPath: string, filePath: string): {
    path: string;
    count: number;
};
export interface ImportResult {
    imported: number;
    unchanged: number;
    skipped: string[];
    overwritten: number;
}
export declare function importGlobals(globalDirPath: string, filePath: string, overwrite: boolean): ImportResult;
