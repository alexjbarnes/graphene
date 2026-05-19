import type { GrapheneDatabase } from "../db.js";
export declare function handleUpsertNode(db: GrapheneDatabase, args: Record<string, unknown>): {
    name: string;
    created: boolean;
};
