import { readNode, writeNode, type StoredNode } from "../store.js";

export interface UpsertNodeParams {
  name: string;
  type?: string;
  summary?: string;
  entry_points?: string[];
  covers?: string[];
  last_commit?: string;
  metadata?: Record<string, unknown>;
}

interface UpsertResult {
  name: string;
  status: "created" | "updated";
  fields_updated?: string[];
}

const KNOWN_FIELDS = new Set([
  "name",
  "type",
  "summary",
  "entry_points",
  "covers",
  "last_commit",
  "metadata",
]);

function tryParse(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} is a string but not valid JSON`);
  }
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  const parsed = typeof value === "string" ? tryParse(value, label) : value;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    const suffix = typeof value === "string" ? " or a JSON object string" : "";
    throw new Error(`${label} must be an object${suffix}`);
  }
  return parsed as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  const parsed = typeof value === "string" ? tryParse(value, label) : value;
  if (!Array.isArray(parsed)) {
    const suffix = typeof value === "string" ? " or a JSON array string" : "";
    throw new Error(`${label} must be an array${suffix}`);
  }
  return parsed;
}

// Defensive normalization. Models frequently follow the `upsert_node(name,
// fields)` shorthand and wrap every field in a `fields` object, sometimes as a
// JSON string, and sometimes JSON-stringify structured fields on their own. The
// flat schema would silently drop all of it and report nothing changed. Unwrap
// and coerce so a well-meant write is never lost, and reject anything we still
// do not recognize so the failure is loud, not silent.
export function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  let merged: Record<string, unknown> = { ...args };

  if ("fields" in merged && merged.fields !== undefined && merged.fields !== null) {
    const fields = asObject(merged.fields, "fields");
    delete merged.fields;
    merged = { ...fields, ...merged }; // explicit top-level keys win over wrapped
  }

  if (typeof merged.metadata === "string") {
    merged.metadata = asObject(merged.metadata, "metadata");
  }
  if (typeof merged.entry_points === "string") {
    merged.entry_points = asArray(merged.entry_points, "entry_points");
  }
  if (typeof merged.covers === "string") {
    merged.covers = asArray(merged.covers, "covers");
  }

  const unknown = Object.keys(merged).filter((k) => !KNOWN_FIELDS.has(k));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown field(s): ${unknown.join(", ")}. upsert_node takes top-level fields: ` +
        `name, type, summary, entry_points, covers, last_commit, metadata. Do not wrap them in a "fields" object.`
    );
  }
  return merged;
}

// Pure core shared with batch.ts: given the node's current state (or null if
// it does not exist yet) and normalized params, returns the StoredNode that
// should be written. No disk IO, so batch can fold many of these in memory
// before Phase B commits anything.
export function applyUpsert(
  existing: StoredNode | null,
  params: UpsertNodeParams
): { node: StoredNode; status: "created" | "updated"; fields_updated?: string[] } {
  if (!existing) {
    if (!params.type) throw new Error("type is required when creating a node");

    const node: StoredNode = {
      name: params.name,
      type: params.type,
      summary: params.summary ?? null,
      entry_points: params.entry_points ?? [],
      covers: params.covers ?? [],
      last_commit: params.last_commit ?? null,
      metadata: params.metadata ?? {},
      edges: [],
      observations: [],
    };
    return { node, status: "created" };
  }

  const fieldsUpdated: string[] = [];
  const node: StoredNode = { ...existing };

  if (params.type !== undefined) {
    node.type = params.type;
    fieldsUpdated.push("type");
  }
  if (params.summary !== undefined) {
    node.summary = params.summary;
    fieldsUpdated.push("summary");
  }
  if (params.entry_points !== undefined) {
    node.entry_points = params.entry_points;
    fieldsUpdated.push("entry_points");
  }
  if (params.covers !== undefined) {
    node.covers = params.covers;
    fieldsUpdated.push("covers");
  }
  if (params.last_commit !== undefined) {
    node.last_commit = params.last_commit;
    fieldsUpdated.push("last_commit");
  }
  if (params.metadata !== undefined) {
    node.metadata = { ...existing.metadata, ...params.metadata };
    fieldsUpdated.push("metadata");
  }

  if (fieldsUpdated.length === 0) {
    throw new Error(
      `upsert_node for existing node "${params.name}" provided no fields to update. ` +
        `Pass fields as top-level args (summary, covers, entry_points, last_commit, metadata, type), ` +
        `not wrapped in a "fields" object.`
    );
  }

  return { node, status: "updated", fields_updated: fieldsUpdated };
}

export function handleUpsertNode(
  repoRoot: string,
  args: Record<string, unknown>
): UpsertResult {
  const params = normalizeArgs(args) as unknown as UpsertNodeParams;
  if (!params.name) throw new Error("name is required");

  const existing = readNode(repoRoot, params.name);
  const applied = applyUpsert(existing, params);
  writeNode(repoRoot, applied.node);

  if (applied.status === "created") {
    return { name: params.name, status: "created" };
  }
  return { name: params.name, status: "updated", fields_updated: applied.fields_updated! };
}
