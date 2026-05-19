import type { GrapheneDatabase } from "../db.js";
export declare function handleGlobalDelete(db: GrapheneDatabase, args: Record<string, unknown>): {
    deleted: boolean;
};
