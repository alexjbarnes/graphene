export declare function getRepoRoot(cwd?: string): string;
export declare function getRemoteUrl(repoRoot: string): string | null;
export declare function getHead(repoRoot: string): string;
export declare function getChangedFiles(repoRoot: string, sinceCommit: string, paths: string[]): string[];
