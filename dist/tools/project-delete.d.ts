import type { GrapheneDatabase } from "../db.js";
export declare function handleProjectDelete(db: GrapheneDatabase, repoId: number, args: Record<string, unknown>): {
    deleted: boolean;
};
