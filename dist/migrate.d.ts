export declare function isSqliteAvailable(): boolean;
export declare function legacyRepoDbPath(repoRoot: string): string;
export declare function legacyGlobalDbPath(): string;
export interface MigrateRepoResult {
    migrated: boolean;
    nodes: number;
    facts: number;
    renamed: string[];
}
export declare function migrateRepo(repoRoot: string): MigrateRepoResult;
export interface MigrateGlobalResult {
    migrated: boolean;
    facts: number;
    renamed: string[];
}
export declare function migrateGlobal(globalDirPath: string): MigrateGlobalResult;
