import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { GrapheneDatabase } from "./db.js";
import { existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handleRead } from "./tools/read.js";
import { handleSearch } from "./tools/search.js";
import { handleUpsertNode } from "./tools/upsert-node.js";
import { handleLearn } from "./tools/learn.js";
import { handleLink } from "./tools/link.js";
import { handleUnlink } from "./tools/unlink.js";
import { handleStale } from "./tools/stale.js";
import { handleGlobalRead } from "./tools/global-read.js";
import { handleGlobalWrite } from "./tools/global-write.js";
import { handleRemoveObservation } from "./tools/remove-observation.js";
import { handleDeleteNode } from "./tools/delete-node.js";
import { handleBatch } from "./tools/batch.js";
import { handleStatus } from "./tools/status.js";

export interface ServerContext {
  repoDB: GrapheneDatabase | null;
  globalDB: GrapheneDatabase;
  repoRoot: string | null;
}

const TOOLS = [
  {
    name: "status",
    description:
      "Get full context: node index, stale nodes, current HEAD, and user preferences/facts. Automatically injected at session start by the hook, but can be called manually to refresh.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "read",
    description:
      "Read the context graph. No arguments returns the full index (all node names, types, summaries). With a name argument, returns the full node including outgoing edges, incoming dependents with neighbor summaries, and observations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Node name to read. Omit for the full index.",
        },
      },
    },
  },
  {
    name: "search",
    description:
      "Full-text search across node names, summaries, and observations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "upsert_node",
    description:
      "Create a new node or merge-update an existing one. Only provided fields are changed on update. Metadata is shallow-merged.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Node identifier (slug)" },
        type: {
          type: "string",
          description:
            "Node type (e.g. subsystem, module, library). Required on create.",
        },
        summary: { type: "string", description: "One-line purpose statement" },
        entry_points: {
          type: "array",
          items: { type: "string" },
          description: "Key files to start reading",
        },
        covers: {
          type: "array",
          items: { type: "string" },
          description: "File/directory patterns this node covers",
        },
        last_commit: {
          type: "string",
          description: "Commit hash this node was generated from",
        },
        metadata: {
          type: "object",
          description:
            "Freeform structured data (interfaces, invariants, etc). Shallow-merged on update.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "learn",
    description:
      "Append a learned observation to a node. Observations are append-only and never overwrite existing ones.",
    inputSchema: {
      type: "object" as const,
      properties: {
        node_name: {
          type: "string",
          description: "Node to attach the observation to",
        },
        content: { type: "string", description: "The learned observation" },
        source: {
          type: "string",
          description: "What triggered this learning (optional)",
        },
      },
      required: ["node_name", "content"],
    },
  },
  {
    name: "link",
    description:
      "Create an edge between two nodes. Bidirectional types (related_to, mirrors) automatically create edges in both directions. Idempotent: re-linking updates the reason.",
    inputSchema: {
      type: "object" as const,
      properties: {
        from: { type: "string", description: "Source node name" },
        to: { type: "string", description: "Target node name" },
        type: {
          type: "string",
          description:
            "Edge type: related_to, depends_on, mirrors, or extends",
        },
        reason: {
          type: "string",
          description: "Why this relationship exists",
        },
      },
      required: ["from", "to", "type"],
    },
  },
  {
    name: "unlink",
    description:
      "Remove an edge between two nodes. Without type, removes all edges between them.",
    inputSchema: {
      type: "object" as const,
      properties: {
        from: { type: "string", description: "Source node name" },
        to: { type: "string", description: "Target node name" },
        type: {
          type: "string",
          description: "Specific edge type to remove (optional)",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "stale",
    description:
      "Check which nodes have stale context by comparing their covered files against git changes since their last_commit.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "global_read",
    description:
      "Read user-level facts (preferences, expertise, conventions). No arguments returns all facts.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description: "Filter by category (preference, expertise, convention)",
        },
        subject: {
          type: "string",
          description: "Filter by subject (go, testing, communication, etc)",
        },
      },
    },
  },
  {
    name: "global_write",
    description:
      "Write a user-level fact. One fact per category+subject pair; writing to an existing pair replaces the content.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: { type: "string", description: "Fact category" },
        subject: { type: "string", description: "Fact subject" },
        content: { type: "string", description: "Fact content" },
      },
      required: ["category", "subject", "content"],
    },
  },
  {
    name: "remove_observation",
    description:
      "Remove a specific observation by ID. Use when a learned fact turns out to be wrong or outdated.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "number",
          description: "Observation ID (from read response)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_node",
    description:
      "Delete a node and all its edges and observations. Use when a subsystem has been removed from the codebase.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Node name to delete" },
      },
      required: ["name"],
    },
  },
  {
    name: "batch",
    description:
      "Create or update multiple nodes, edges, and observations in a single transaction. Pass three top-level arrays: nodes, edges, observations. Each node object uses the same fields as upsert_node (name required, plus summary, covers, entry_points, last_commit). Every node should include summary, covers, entry_points, and last_commit.",
    inputSchema: {
      type: "object" as const,
      properties: {
        nodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Node identifier (slug)" },
              type: { type: "string", description: "Node type (e.g. subsystem, module)" },
              summary: { type: "string", description: "One-line purpose statement" },
              entry_points: { type: "array", items: { type: "string" }, description: "Key files" },
              covers: { type: "array", items: { type: "string" }, description: "File/directory patterns" },
              last_commit: { type: "string", description: "Commit hash" },
              metadata: { type: "object", description: "Freeform structured data, shallow-merged on update" },
            },
            required: ["name"],
          },
          description: "Array of node objects to create or update",
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: { type: "string", description: "Source node name" },
              to: { type: "string", description: "Target node name" },
              type: { type: "string", description: "Relationship type (e.g. depends_on, extends)" },
              reason: { type: "string", description: "Why this relationship exists" },
            },
            required: ["from", "to", "type"],
          },
          description: "Array of edge objects to create",
        },
        observations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              node_name: { type: "string", description: "Node to attach observation to" },
              content: { type: "string", description: "What was learned" },
            },
            required: ["node_name", "content"],
          },
          description: "Array of observations to record",
        },
      },
    },
  },
];

export function createServer(ctx: ServerContext): Server {
  const server = new Server(
    { name: "graphene", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions: [
        "Graph status is automatically injected at session start. You do not need to call `status` manually.",
        "Before working on any subsystem, call `read(name)` on the relevant node. It contains entry_points, observations, and edges that tell you where to look.",
        "If the graph is empty, explore the codebase and populate with `batch()`. Every node must have summary, covers, entry_points, and last_commit.",
        "After changing code, update `last_commit` on affected nodes. When you learn something non-obvious, call `learn`. When you spend 3+ tool calls finding something, record where you found it.",
      ].join("\n\n"),
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.oninitialized = () => {
    if (ctx.repoRoot) ensureClaudeMd(ctx.repoRoot);
  };

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = dispatch(ctx, name, args ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  return server;
}

const GRAPHENE_MARKER = "<!-- graphene -->";
const GRAPHENE_MARKER_END = "<!-- /graphene -->";

const GRAPHENE_CLAUDE_MD = `
${GRAPHENE_MARKER}
## Graphene Context Graph

This project has a persistent context graph. The graph status (node index, stale nodes, user preferences) is automatically injected at the start of each session. You do not need to call status manually.

### Using the graph
- Before exploring unfamiliar code, call \`read(name)\` on the relevant node. It contains entry_points (where to start reading), observations (what prior sessions learned), and edges (related subsystems).
- Before claiming something doesn't exist, check edges on related nodes and use \`search(query)\` to check observations from prior sessions.

### After changing code
- Update \`last_commit\` on affected nodes: \`upsert_node(name, {last_commit: "<current HEAD>"})\`

### When you learn something
- Found code somewhere unexpected: \`learn(node_name, content)\`
- Spent 3+ tool calls locating something: record where you found it.
- Discovered a cross-cutting relationship: \`link(from, to, type, reason)\`
- Something you assumed was wrong: remove the old observation, add the correction.

### First session (empty graph)
If the graph is empty, explore the codebase and populate with \`batch()\`. Every node must include:
- \`summary\`: one-line purpose statement.
- \`covers\`: file/directory patterns (e.g. \`["src/auth/"]\`). Required for staleness tracking.
- \`entry_points\`: key files to start reading.
- \`last_commit\`: set to current HEAD so staleness tracking starts immediately.

Prefer fewer complete nodes over many empty ones.
${GRAPHENE_MARKER_END}
`;

function ensureClaudeMd(repoRoot: string): void {
  const claudeMdPath = join(repoRoot, "CLAUDE.md");

  if (!existsSync(claudeMdPath)) {
    writeFileSync(claudeMdPath, GRAPHENE_CLAUDE_MD.trimStart());
    return;
  }

  const content = readFileSync(claudeMdPath, "utf-8");
  if (!content.includes(GRAPHENE_MARKER)) {
    appendFileSync(claudeMdPath, GRAPHENE_CLAUDE_MD);
    return;
  }

  const startIndex = content.indexOf(GRAPHENE_MARKER);
  const endIndex = content.indexOf(GRAPHENE_MARKER_END);

  const before = content.slice(0, startIndex);
  const after = endIndex !== -1
    ? content.slice(endIndex + GRAPHENE_MARKER_END.length).replace(/^\n/, "")
    : "";
  writeFileSync(claudeMdPath, before + GRAPHENE_CLAUDE_MD.trimStart() + after);
}

function requireRepo(ctx: ServerContext): { repoDB: GrapheneDatabase; repoRoot: string } {
  if (!ctx.repoDB || !ctx.repoRoot) {
    throw new Error("Not in a git repository. Repo-specific tools are unavailable.");
  }
  return { repoDB: ctx.repoDB, repoRoot: ctx.repoRoot };
}

function dispatch(
  ctx: ServerContext,
  tool: string,
  args: Record<string, unknown>
): unknown {
  switch (tool) {
    case "global_read":
      return handleGlobalRead(ctx.globalDB, args);
    case "global_write":
      return handleGlobalWrite(ctx.globalDB, args);
    default: {
      const { repoDB, repoRoot } = requireRepo(ctx);
      switch (tool) {
        case "status":
          return handleStatus(repoDB, ctx.globalDB, repoRoot, args);
        case "read":
          return handleRead(repoDB, args);
        case "search":
          return handleSearch(repoDB, args);
        case "upsert_node":
          return handleUpsertNode(repoDB, args);
        case "learn":
          return handleLearn(repoDB, args);
        case "link":
          return handleLink(repoDB, args);
        case "unlink":
          return handleUnlink(repoDB, args);
        case "stale":
          return handleStale(repoDB, repoRoot, args);
        case "remove_observation":
          return handleRemoveObservation(repoDB, args);
        case "delete_node":
          return handleDeleteNode(repoDB, args);
        case "batch":
          return handleBatch(repoDB, args);
        default:
          throw new Error(`Unknown tool: ${tool}`);
      }
    }
  }
}
