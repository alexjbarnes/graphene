export interface StoredEdge {
    to: string;
    type: string;
    reason: string | null;
}
export interface StoredObservation {
    id: string;
    content: string;
    source: string | null;
}
export interface StoredNode {
    name: string;
    type: string;
    summary: string | null;
    entry_points: string[];
    covers: string[];
    last_commit: string | null;
    metadata: Record<string, unknown>;
    edges: StoredEdge[];
    observations: StoredObservation[];
}
export interface StoredFact {
    category: string;
    subject: string;
    content: string;
}
export declare function isValidSlug(s: string): boolean;
export declare function validateSlug(s: string, label: string): void;
export declare function observationId(content: string, existingIds: Set<string>): string;
export declare function parseNodeFile(text: string, name: string): StoredNode;
export declare function serializeNodeFile(node: StoredNode): string;
export declare function parseFactFile(text: string): StoredFact;
export declare function serializeFactFile(fact: StoredFact): string;
export declare function grapheneDir(repoRoot: string): string;
export declare function nodesDir(repoRoot: string): string;
export declare function factsDir(repoRoot: string): string;
export declare function nodePath(repoRoot: string, name: string): string;
export declare function factPath(repoRoot: string, category: string, subject: string): string;
export declare function globalDir(): string;
export declare function globalFactPath(category: string, subject: string): string;
export declare function writeFileAtomic(path: string, content: string): void;
export declare function appendLineVerified(path: string, line: string, marker: string): void;
export declare function listNodes(repoRoot: string): string[];
export declare function readNode(repoRoot: string, name: string): StoredNode | null;
export declare function writeNode(repoRoot: string, node: StoredNode): void;
export declare function deleteNodeFile(repoRoot: string, name: string): boolean;
export declare function listFacts(dir: string): StoredFact[];
export declare function readFact(dir: string, category: string, subject: string): StoredFact | null;
export declare function writeFact(dir: string, fact: StoredFact): void;
export declare function deleteFactFile(dir: string, category: string, subject: string): boolean;
