import type { GrapheneDatabase } from "../db.js";
export declare function handleLearn(db: GrapheneDatabase, repoId: number, args: Record<string, unknown>): {
    id: number;
    node_name: string;
};
