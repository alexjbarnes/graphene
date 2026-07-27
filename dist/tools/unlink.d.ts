import type { GrapheneDatabase } from "../db.js";
export declare function handleUnlink(db: GrapheneDatabase, repoId: number, args: Record<string, unknown>): {
    removed: number;
};
