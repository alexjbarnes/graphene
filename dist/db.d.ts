import Database from "better-sqlite3";
export type GrapheneDatabase = Database.Database;
export declare function openDatabase(path: string): GrapheneDatabase;
export declare function openMemoryDatabase(): GrapheneDatabase;
export declare function initSchema(db: GrapheneDatabase): void;
export declare function ensureRepo(db: GrapheneDatabase, rootPath: string, remoteUrl: string | null): number;
