export declare function getRepoRoot(cwd?: string): string;
export declare function getHead(repoRoot: string): string;
export declare function getChangedFiles(repoRoot: string, sinceCommit: string, paths: string[]): string[];
export declare function getUnreviewedFiles(repoRoot: string, sinceCommit: string, paths: string[], nodeFile: string): string[];
