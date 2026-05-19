import type Database from "better-sqlite3";
export declare function handleUnlink(db: Database.Database, args: Record<string, unknown>): {
    removed: number;
};
