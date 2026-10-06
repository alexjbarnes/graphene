import type { StoredObservation } from "./store.js";

// Characters of observation text one node may hold, so read(name) can always
// return it whole in one tool result. learn() and batch() refuse a write that
// would take a node past it. They check, then write, without a lock, so
// concurrent writers can overshoot by a note; read(name) previews anything
// past the budget either way.
export const READ_BUDGET = 20_000;

// Characters one observation may hold: one point in a few sentences.
// Essay-length observations caused most of the bloat in real nodes.
export const OBSERVATION_LIMIT = 1_500;

const LARGEST_SHOWN = 5;
const PREVIEW_CHARS = 80;

function preview(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}...` : flat;
}

// Throws unless every addition fits OBSERVATION_LIMIT and the node, with all
// of them appended to `existing`, stays within READ_BUDGET. A refusal is a
// discovery about to be dropped, so the error says how to make room and to
// record it after, and lists the node's largest observations: the likeliest
// to condense, move, or remove.
export function checkObservationBudget(
  nodeName: string,
  existing: StoredObservation[],
  additions: string[]
): void {
  for (const content of additions) {
    if (content.length > OBSERVATION_LIMIT) {
      throw new Error(
        `Observation for node "${nodeName}" is ${content.length} characters, over the ` +
          `${OBSERVATION_LIMIT}-character limit: "${preview(content)}". Cut it to one point in a few ` +
          `sentences, leaving out what the code and its comments already say, then record it, or record ` +
          `each point as its own observation.`
      );
    }
  }

  const held = existing.reduce((sum, o) => sum + o.content.length, 0);
  const adding = additions.reduce((sum, c) => sum + c.length, 0);
  if (held + adding <= READ_BUDGET) return;

  const largest = [...existing]
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, LARGEST_SHOWN)
    .map((o) => `${o.id} (${o.content.length} chars) "${preview(o.content)}"`);
  throw new Error(
    `Node "${nodeName}" holds ${held} characters of observations; adding ${adding} more would take it past ` +
      `the ${READ_BUDGET}-character read budget. Make room, then record this: remove superseded observations ` +
      `with remove_observation(node, id), or split the node by topic (upsert_node a node per topic, learn() ` +
      `its observations there, remove them here).` +
      (largest.length > 0 ? ` Largest observations: ${largest.join("; ")}.` : "")
  );
}
