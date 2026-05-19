import type Database from "better-sqlite3";
export declare function handleDeleteNode(db: Database.Database, args: Record<string, unknown>): {
    deleted: boolean;
};
