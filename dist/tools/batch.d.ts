interface BatchResult {
    nodes_created: number;
    nodes_updated: number;
    edges_created: number;
    observations_added: number;
}
export declare function handleBatch(repoRoot: string, args: Record<string, unknown>): BatchResult;
export {};
