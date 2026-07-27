import type { StaleNode } from "../types.js";
interface NodeSummary {
    name: string;
    type: string;
    summary: string | null;
    observation_count: number;
}
interface FactSummary {
    count: number;
    keys: string[];
}
interface StatusResult {
    head: string;
    nodes: NodeSummary[];
    stale_nodes: StaleNode[];
    project_facts: FactSummary;
    global_facts: FactSummary;
}
export declare function boundedKeys(keys: string[]): string[];
export declare function handleStatus(repoRoot: string, globalDirPath: string, _args: Record<string, unknown>): StatusResult;
export {};
