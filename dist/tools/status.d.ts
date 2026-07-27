import type { GrapheneDatabase } from "../db.js";
import type { IndexEntry, Fact, StaleNode } from "../types.js";
interface StatusResult {
    head: string;
    nodes: IndexEntry[];
    stale_nodes: StaleNode[];
    project_facts: Fact[];
    global_facts: Fact[];
    observations_by_node: Record<string, string[]>;
}
export declare function handleStatus(db: GrapheneDatabase, repoId: number, repoRoot: string, _args: Record<string, unknown>): StatusResult;
export {};
