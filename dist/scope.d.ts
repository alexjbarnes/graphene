export interface RepoScope {
    name: string;
    root: string;
}
export declare function discoverScopes(cwd: string): RepoScope[];
export type ParsedNodeRef = {
    scope: RepoScope;
    name: string;
} | {
    name: string;
};
export declare function parseNodeRef(ref: string, scopes: RepoScope[]): ParsedNodeRef;
export declare function resolveNodeRef(ref: string, scopes: RepoScope[]): {
    scope: RepoScope;
    name: string;
};
export declare function resolveUpsertRef(ref: string, scopes: RepoScope[]): ParsedNodeRef;
export declare function resolveWriteTarget(scopes: RepoScope[], name: string, cwd: string, coverPaths: string[]): RepoScope;
export declare function rewriteRepoRelative(scope: RepoScope, cwd: string, paths: string[]): string[];
