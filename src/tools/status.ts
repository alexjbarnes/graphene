import type { GrapheneDatabase } from "../db.js";
import type { IndexEntry, Fact, StaleNode } from "../types.js";
import { getChangedFiles, getHead } from "../git.js";

interface StatusResult {
  head: string;
  nodes: IndexEntry[];
  stale_nodes: StaleNode[];
  project_facts: Fact[];
  global_facts: Fact[];
  observations_by_node: Record<string, string[]>;
}

export function handleStatus(
  db: GrapheneDatabase,
  repoId: number,
  repoRoot: string,
  _args: Record<string, unknown>
): StatusResult {
  const head = getHead(repoRoot);

  const nodes = db
    .prepare("SELECT name, type, summary FROM nodes WHERE repo_id = ? ORDER BY name")
    .all(repoId) as unknown as IndexEntry[];

  const allNodes = db
    .prepare("SELECT name, covers, last_commit FROM nodes WHERE repo_id = ?")
    .all(repoId) as Array<{
    name: string;
    covers: string;
    last_commit: string | null;
  }>;

  const staleNodes: StaleNode[] = [];
  for (const node of allNodes) {
    const covers: string[] = JSON.parse(node.covers || "[]");

    if (!node.last_commit) {
      staleNodes.push({ name: node.name, reason: "untracked", changed_files: [] });
      continue;
    }

    if (covers.length === 0) continue;

    const changed = getChangedFiles(repoRoot, node.last_commit, covers);
    if (changed.length > 0) {
      staleNodes.push({ name: node.name, reason: "changed", changed_files: changed });
    }
  }

  const projectFacts = db
    .prepare("SELECT * FROM project_facts WHERE repo_id = ? ORDER BY category, subject")
    .all(repoId) as unknown as Fact[];

  const globalFacts = db
    .prepare("SELECT * FROM facts ORDER BY category, subject")
    .all() as unknown as Fact[];

  const observations = db
    .prepare("SELECT node_name, content FROM observations WHERE repo_id = ? ORDER BY created_at DESC")
    .all(repoId) as unknown as Array<{ node_name: string; content: string }>;

  const observationsByNode: Record<string, string[]> = {};
  for (const obs of observations) {
    if (!observationsByNode[obs.node_name]) observationsByNode[obs.node_name] = [];
    if (observationsByNode[obs.node_name].length < 3) {
      observationsByNode[obs.node_name].push(obs.content);
    }
  }

  return {
    head,
    nodes,
    stale_nodes: staleNodes,
    project_facts: projectFacts,
    global_facts: globalFacts,
    observations_by_node: observationsByNode,
  };
}
