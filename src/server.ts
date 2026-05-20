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
import { handleGlobalDelete } from "./tools/global-delete.js";
import { handleProjectRead } from "./tools/project-read.js";
import { handleProjectWrite } from "./tools/project-write.js";
import { handleProjectDelete } from "./tools/project-delete.js";
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
    name: "global_delete",
    description:
      "Remove a user-level fact by category and subject.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: { type: "string", description: "Fact category" },
        subject: { type: "string", description: "Fact subject" },
      },
      required: ["category", "subject"],
    },
  },
  {
    name: "project_read",
    description:
      "Read repo-scoped facts (conventions, context, decisions specific to this project). No arguments returns all project facts.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: { type: "string", description: "Filter by category" },
        subject: { type: "string", description: "Filter by subject" },
      },
    },
  },
  {
    name: "project_write",
    description:
      "Write a repo-scoped fact. One fact per category+subject pair; writing to an existing pair replaces the content. Use for project-specific conventions, decisions, and context that don't belong on a node.",
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
    name: "project_delete",
    description:
      "Remove a repo-scoped fact by category and subject.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: { type: "string", description: "Fact category" },
        subject: { type: "string", description: "Fact subject" },
      },
      required: ["category", "subject"],
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
        "Graph status is automatically injected at session start. You do not need to call `status` manually unless you want to refresh.",
        "You MUST call `read(name)` on relevant nodes before working on any subsystem. Do not start reading files, grepping, or exploring until you have checked the graph.",
        "If the graph is empty, you MUST explore the codebase and populate with `batch()` before doing anything else.",
        "Record immediately, do not defer: after changing code, update affected nodes with `learn()`, summary, entry_points, and `last_commit`. When you discover an architectural boundary, constraint, gotcha, or workaround, record it with `learn()` or `project_write()`. When the user corrects your approach or gives a preference, record it with `project_write()` or `global_write()`. Updating `last_commit` alone is not sufficient.",
        "Tool scope: `learn(node, content)` for code knowledge on a node. `project_write(category, subject, content)` for repo-specific conventions and preferences. `global_write(category, subject, content)` for user preferences across repos. If unsure about scope, ask the user.",
        "Graphene replaces auto-memory. Do NOT write to memory files when graphene is installed. All facts, preferences, conventions, and workflow rules go into graphene via `project_write`, `global_write`, or `learn`. Two persistence systems means future sessions must check both places, which defeats the purpose.",
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

This project has a persistent context graph. The graph status is automatically injected at session start. You MUST read relevant nodes before working on any subsystem.

### Before you start
1. Read the injected status (automatic on first tool call)
2. Call \`read(name)\` on every node relevant to your task
3. Only then start reading files or grepping

### Reading
- \`read(name)\` - get node detail: entry_points, observations, edges
- \`search(query)\` - find across nodes and observations

### Writing
- \`learn(node, content)\` - record code knowledge on a node (where things live, gotchas, patterns)
- \`project_write(category, subject, content)\` - record repo-specific conventions, decisions, context
- \`global_write(category, subject, content)\` - record preferences that apply across all repos. If unsure whether something is project or global, ask the user.
- \`upsert_node(name, fields)\` - update a node after changing its code
- \`link(from, to, type, reason)\` - record relationships between subsystems

### Recording triggers (immediate, do not defer)
- You changed code -> update the affected node (observations, summary, entry_points, last_commit)
- You discovered an architectural boundary or constraint -> \`learn(node, observation)\` or \`project_write()\`
- You hit a gotcha, workaround, or surprising behavior -> \`learn(node, observation)\`
- The user corrected your approach or gave a preference -> \`project_write()\` or \`global_write()\`
- You spent 3+ tool calls finding something -> record where you found it

Bumping \`last_commit\` alone is not sufficient. Record what you learned, not just that you were here.

### Empty graph
If the graph has no nodes, use \`/graphene:init\` or populate with \`batch()\`. Every node needs summary, covers, entry_points, and last_commit.

### Red flags (you are rationalizing if you think these)
| Thought | Reality |
|---------|---------|
| "I already know this codebase" | You do not. Read the graph. Prior sessions recorded what they found. |
| "I'll just grep for it" | Check the graph first. The answer may already be there. |
| "I'll update graphene later" | No. Update as you go. You will forget. |
| "I'll just bump last_commit" | Not enough. Review and update observations, summary, entry_points. |
| "This change is too small to record" | Small discoveries compound. Record it. |
| "This is just a fix, not a discovery" | Constraints and boundaries ARE discoveries. Record them. |
| "I'll keep this in memory instead" | No. Graphene replaces memory. Use project_write or global_write. |
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
  const endIndex = content.lastIndexOf(GRAPHENE_MARKER_END);

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
    case "global_delete":
      return handleGlobalDelete(ctx.globalDB, args);
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
        case "project_read":
          return handleProjectRead(repoDB, args);
        case "project_write":
          return handleProjectWrite(repoDB, args);
        case "project_delete":
          return handleProjectDelete(repoDB, args);
        default:
          throw new Error(`Unknown tool: ${tool}`);
      }
    }
  }
}
