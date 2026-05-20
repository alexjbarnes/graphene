export interface GrapheneNode {
  name: string;
  type: string;
  summary: string | null;
  entry_points: string[];
  covers: string[];
  last_commit: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Edge {
  from_node: string;
  to_node: string;
  type: string;
  reason: string | null;
  created_at: string;
}

export interface Observation {
  id: number;
  node_name: string;
  content: string;
  source: string | null;
  created_at: string;
}

export interface Fact {
  id: number;
  category: string;
  subject: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface EdgeWithNeighbor {
  node: string;
  type: string;
  reason: string | null;
  summary: string | null;
}

export interface NodeDetail {
  name: string;
  type: string;
  summary: string | null;
  entry_points: string[];
  covers: string[];
  last_commit: string | null;
  metadata: Record<string, unknown>;
  observations: Pick<Observation, "id" | "content" | "source" | "created_at">[];
  edges: EdgeWithNeighbor[];
  dependents: EdgeWithNeighbor[];
}

export interface IndexEntry {
  name: string;
  type: string;
  summary: string | null;
}

export interface SearchResult {
  type: "node" | "observation" | "project_fact" | "global_fact" | "edge";
  node_name: string;
  snippet: string;
  created_at?: string;
  score?: number;
}

export interface StaleNode {
  name: string;
  reason: "untracked" | "changed";
  changed_files: string[];
}

export const BIDIRECTIONAL_EDGE_TYPES = new Set(["related_to", "mirrors"]);
