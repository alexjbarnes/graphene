import type Database from "better-sqlite3";
import type { Fact } from "../types.js";
export declare function handleGlobalRead(db: Database.Database, args: Record<string, unknown>): {
    facts: Fact[];
};
