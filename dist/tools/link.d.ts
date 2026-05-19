import type Database from "better-sqlite3";
export declare function handleLink(db: Database.Database, args: Record<string, unknown>): {
    from: string;
    to: string;
    type: string;
    bidirectional: boolean;
};
