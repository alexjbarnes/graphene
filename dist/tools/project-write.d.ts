import type { GrapheneDatabase } from "../db.js";
export declare function handleProjectWrite(db: GrapheneDatabase, repoId: number, args: Record<string, unknown>): {
    category: string;
    subject: string;
};
