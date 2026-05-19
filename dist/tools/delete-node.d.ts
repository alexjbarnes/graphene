import type { GrapheneDatabase } from "../db.js";
export declare function handleDeleteNode(db: GrapheneDatabase, args: Record<string, unknown>): {
    deleted: boolean;
};
