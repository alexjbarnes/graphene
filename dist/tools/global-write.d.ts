import type { GrapheneDatabase } from "../db.js";
export declare function handleGlobalWrite(db: GrapheneDatabase, args: Record<string, unknown>): {
    category: string;
    subject: string;
};
