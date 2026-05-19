import type Database from "better-sqlite3";
export declare function handleGlobalWrite(db: Database.Database, args: Record<string, unknown>): {
    category: string;
    subject: string;
};
