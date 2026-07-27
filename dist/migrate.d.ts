import type { GrapheneDatabase } from "./db.js";
export declare function migrateRepo(db: GrapheneDatabase, repoId: number, repoRoot: string): void;
export declare function migrateGlobal(db: GrapheneDatabase): void;
