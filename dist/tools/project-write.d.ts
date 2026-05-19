import type { GrapheneDatabase } from "../db.js";
export declare function handleProjectWrite(db: GrapheneDatabase, args: Record<string, unknown>): {
    category: string;
    subject: string;
};
