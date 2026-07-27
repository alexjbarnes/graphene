import type { GrapheneDatabase } from "../db.js";
export declare function handleRemoveObservation(db: GrapheneDatabase, repoId: number, args: Record<string, unknown>): {
    removed: boolean;
};
