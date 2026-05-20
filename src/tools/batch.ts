import type { GrapheneDatabase } from "../db.js";
import { handleUpsertNode } from "./upsert-node.js";
import { handleLink } from "./link.js";
import { handleLearn } from "./learn.js";

interface BatchParams {
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
  observations?: Array<Record<string, unknown>>;
}

interface BatchResult {
  nodes_created: number;
  nodes_updated: number;
  edges_created: number;
  observations_added: number;
}

const VALID_KEYS = new Set(["nodes", "edges", "observations"]);

export function handleBatch(
  db: GrapheneDatabase,
  args: Record<string, unknown>
): BatchResult {
  const unknown = Object.keys(args).filter((k) => !VALID_KEYS.has(k));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown keys: ${unknown.join(", ")}. batch accepts three top-level arrays: nodes, edges, observations.`
    );
  }
  const params = args as unknown as BatchParams;
  if (!params.nodes?.length && !params.edges?.length && !params.observations?.length) {
    throw new Error(
      "batch requires at least one non-empty array: nodes, edges, or observations."
    );
  }
  const result: BatchResult = {
    nodes_created: 0,
    nodes_updated: 0,
    edges_created: 0,
    observations_added: 0,
  };

  db.transaction(() => {
    if (params.nodes) {
      for (const node of params.nodes) {
        const r = handleUpsertNode(db, node);
        if (r.status === "created") result.nodes_created++;
        else result.nodes_updated++;
      }
    }

    if (params.edges) {
      for (const edge of params.edges) {
        handleLink(db, edge);
        result.edges_created++;
      }
    }

    if (params.observations) {
      for (const obs of params.observations) {
        handleLearn(db, obs);
        result.observations_added++;
      }
    }
  })();

  return result;
}
