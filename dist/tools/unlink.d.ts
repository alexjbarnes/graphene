import type { GrapheneDatabase } from "../db.js";
export declare function handleUnlink(db: GrapheneDatabase, args: Record<string, unknown>): {
    removed: number;
};
