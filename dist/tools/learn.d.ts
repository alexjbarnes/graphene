import type Database from "better-sqlite3";
export declare function handleLearn(db: Database.Database, args: Record<string, unknown>): {
    id: number;
    node_name: string;
};
