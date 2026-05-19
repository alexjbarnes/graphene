import type { GrapheneDatabase } from "../db.js";
export declare function handleLink(db: GrapheneDatabase, args: Record<string, unknown>): {
    from: string;
    to: string;
    type: string;
    bidirectional: boolean;
};
