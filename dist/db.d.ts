import Database from "better-sqlite3";
export declare function openDatabase(path: string): Database.Database;
export declare function initRepoSchema(db: Database.Database): void;
export declare function initGlobalSchema(db: Database.Database): void;
