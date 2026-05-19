import type Database from "better-sqlite3";
export declare function handleUpsertNode(db: Database.Database, args: Record<string, unknown>): {
    name: string;
    created: boolean;
};
