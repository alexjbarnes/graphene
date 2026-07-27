import { listNodes, readNode, listFacts, factsDir } from "../store.js";
import type { StaleNode } from "../types.js";
import { getChangedFiles, getHead } from "../git.js";

const KEYS_CAP = 50;

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

// Caps a list of "category/subject" keys so status can never grow unbounded:
// full fact bodies are never included, only counts and a capped key list.
// Exported so multi-repo status (server.ts) can compute global_facts once,
// against the real globalDir, with the exact same capping.
export function boundedKeys(keys: string[]): string[] {
  if (keys.length <= KEYS_CAP) return keys;
  return [...keys.slice(0, KEYS_CAP), `+${keys.length - KEYS_CAP} more`];
}

export function handleStatus(
  repoRoot: string,
  globalDirPath: string,
  _args: Record<string, unknown>
): StatusResult {
  const head = getHead(repoRoot);

  const nodes: NodeSummary[] = [];
  const staleNodes: StaleNode[] = [];

  for (const name of listNodes(repoRoot)) {
    const node = readNode(repoRoot, name);
    if (!node) continue;

    nodes.push({
      name: node.name,
      type: node.type,
      summary: node.summary,
      observation_count: node.observations.length,
    });

    if (!node.last_commit) {
      staleNodes.push({ name: node.name, reason: "untracked", changed_files: [] });
      continue;
    }
    if (node.covers.length === 0) continue;

    const changed = getChangedFiles(repoRoot, node.last_commit, node.covers);
    if (changed.length > 0) {
      staleNodes.push({ name: node.name, reason: "changed", changed_files: changed });
    }
  }

  const projectFacts = listFacts(factsDir(repoRoot));
  const globalFacts = listFacts(globalDirPath);

  return {
    head,
    nodes,
    stale_nodes: staleNodes,
    project_facts: {
      count: projectFacts.length,
      keys: boundedKeys(projectFacts.map((f) => `${f.category}/${f.subject}`)),
    },
    global_facts: {
      count: globalFacts.length,
      keys: boundedKeys(globalFacts.map((f) => `${f.category}/${f.subject}`)),
    },
  };
}
