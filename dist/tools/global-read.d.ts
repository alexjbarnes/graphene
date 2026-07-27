import { type StoredFact } from "../store.js";
export declare function handleGlobalRead(globalDirPath: string, args: Record<string, unknown>): {
    facts: StoredFact[];
};
