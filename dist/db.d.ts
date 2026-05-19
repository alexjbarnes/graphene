interface RunResult {
    changes: number;
    lastInsertRowid: number;
}
interface Statement {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): RunResult;
}
export interface GrapheneDatabase {
    prepare(sql: string): Statement;
    exec(sql: string): void;
    pragma(cmd: string, opts?: {
        simple: boolean;
    }): unknown;
    transaction<T>(fn: () => T): () => T;
    close(): void;
}
export declare function initSql(): Promise<void>;
export declare function openDatabase(path: string): GrapheneDatabase;
export declare function openMemoryDatabase(): GrapheneDatabase;
export declare function initRepoSchema(db: GrapheneDatabase): void;
export declare function initGlobalSchema(db: GrapheneDatabase): void;
export {};
