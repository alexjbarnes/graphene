import type { GrapheneDatabase } from "../db.js";
import type { Fact } from "../types.js";
export declare function handleGlobalRead(db: GrapheneDatabase, args: Record<string, unknown>): {
    facts: Fact[];
};
