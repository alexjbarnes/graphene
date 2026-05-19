import type Database from "better-sqlite3";
export declare function handleRemoveObservation(db: Database.Database, args: Record<string, unknown>): {
    removed: boolean;
};
