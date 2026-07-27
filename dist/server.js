import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { stripGrapheneBlock } from "./claude-md.js";
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
const TOOLS = [
    {
        name: "status",
        description: "Get a bounded snapshot: node index, stale nodes, current HEAD, and project/global fact counts and keys " +
            "(never fact or observation bodies). Automatically injected at session start by the hook, but can be " +
            "called manually to refresh. For observation or fact content, call read(name), project_read(), or global_read().",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "read",
        description: "Read the context graph. No arguments returns the full index (all node names, types, summaries). With a name argument, returns the full node including outgoing edges, incoming dependents with neighbor summaries, and observations.",
        inputSchema: {
            type: "object",
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
        description: "Search across nodes, observations, project facts, global facts, and edge reasons. Multi-word queries " +
            "match any word and rank by relevance. Returns at most the top 20 results, each with a truncated snippet.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query" },
            },
            required: ["query"],
        },
    },
    {
        name: "upsert_node",
        description: "Create a new node or merge-update an existing one. Only provided fields are changed on update. Metadata is shallow-merged.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Node identifier (slug)" },
                type: {
                    type: "string",
                    description: "Node type (e.g. subsystem, module, library). Required on create.",
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
                    description: "Freeform structured data (interfaces, invariants, etc). Shallow-merged on update.",
                },
            },
            required: ["name"],
        },
    },
    {
        name: "learn",
        description: "Append a learned observation to a node. Observations are append-only and never overwrite existing ones.",
        inputSchema: {
            type: "object",
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
        description: "Create an edge between two nodes. Bidirectional types (related_to, mirrors) automatically create edges in both directions. Idempotent: re-linking updates the reason.",
        inputSchema: {
            type: "object",
            properties: {
                from: { type: "string", description: "Source node name" },
                to: { type: "string", description: "Target node name" },
                type: {
                    type: "string",
                    description: "Edge type: related_to, depends_on, mirrors, or extends",
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
        description: "Remove an edge between two nodes. Without type, removes all edges between them.",
        inputSchema: {
            type: "object",
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
        description: "Check which nodes have stale context by comparing their covered files against git changes since their last_commit.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "global_read",
        description: "Read user-level facts (preferences, expertise, conventions). No arguments returns all facts.",
        inputSchema: {
            type: "object",
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
        description: "Write a user-level fact. One fact per category+subject pair; writing to an existing pair replaces the content.",
        inputSchema: {
            type: "object",
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
        description: "Remove a user-level fact by category and subject.",
        inputSchema: {
            type: "object",
            properties: {
                category: { type: "string", description: "Fact category" },
                subject: { type: "string", description: "Fact subject" },
            },
            required: ["category", "subject"],
        },
    },
    {
        name: "project_read",
        description: "Read repo-scoped facts (conventions, context, decisions specific to this project). No arguments returns all project facts.",
        inputSchema: {
            type: "object",
            properties: {
                category: { type: "string", description: "Filter by category" },
                subject: { type: "string", description: "Filter by subject" },
            },
        },
    },
    {
        name: "project_write",
        description: "Write a repo-scoped fact. One fact per category+subject pair; writing to an existing pair replaces the content. Use for project-specific conventions, decisions, and context that don't belong on a node.",
        inputSchema: {
            type: "object",
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
        description: "Remove a repo-scoped fact by category and subject.",
        inputSchema: {
            type: "object",
            properties: {
                category: { type: "string", description: "Fact category" },
                subject: { type: "string", description: "Fact subject" },
            },
            required: ["category", "subject"],
        },
    },
    {
        name: "remove_observation",
        description: "Remove a specific observation by ID. Use when a learned fact turns out to be wrong or outdated.",
        inputSchema: {
            type: "object",
            properties: {
                node_name: {
                    type: "string",
                    description: "Node the observation belongs to",
                },
                id: {
                    type: "string",
                    description: "Observation ID (from read response)",
                },
            },
            required: ["node_name", "id"],
        },
    },
    {
        name: "delete_node",
        description: "Delete a node and all its edges and observations. Use when a subsystem has been removed from the codebase.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Node name to delete" },
            },
            required: ["name"],
        },
    },
    {
        name: "batch",
        description: "Create or update multiple nodes, edges, and observations in a single transaction. Pass three top-level arrays: nodes, edges, observations. Each node object uses the same fields as upsert_node (name required, plus summary, covers, entry_points, last_commit). Every node should include summary, covers, entry_points, and last_commit.",
        inputSchema: {
            type: "object",
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
export function createServer(ctx) {
    const server = new Server({ name: "graphene", version: "0.1.0" }, {
        capabilities: { tools: {} },
        instructions: [
            "Graph status is automatically injected at session start. You do not need to call `status` manually unless you want to refresh.",
            "You MUST call `read(name)` on relevant nodes before working on any subsystem. Do not start reading files, grepping, or exploring until you have checked the graph.",
            "If the graph is empty, you MUST explore the codebase and populate with `batch()` before doing anything else.",
            "Record immediately, do not defer: after changing code, update affected nodes with `learn()`, summary, entry_points, and `last_commit`. When you discover an architectural boundary, constraint, gotcha, or workaround, record it with `learn()` or `project_write()`. When the user corrects your approach or gives a preference, record it with `project_write()` or `global_write()`. Updating `last_commit` alone is not sufficient.",
            "Recording is triggered by what you learned, not by whether a node already covers the file. If no node covers what you changed or discovered, that is a gap to fill, never a reason to skip: create a node if it is a real subsystem, otherwise `project_write()` the convention. 'No node covers this' must never be your stopping point.",
            "Tool scope: `learn(node, content)` for code knowledge on a node. `project_write(category, subject, content)` for repo-specific conventions and preferences. `global_write(category, subject, content)` for user preferences across repos. If unsure about scope, ask the user.",
            "Graphene replaces auto-memory. Do NOT write to memory files when graphene is installed. All facts, preferences, conventions, and workflow rules go into graphene via `project_write`, `global_write`, or `learn`. Two persistence systems means future sessions must check both places, which defeats the purpose.",
        ].join("\n\n"),
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: TOOLS,
    }));
    server.oninitialized = () => {
        // Migration: earlier versions wrote the rules into the repo's CLAUDE.md.
        // The rules now come from the SessionStart hook, so strip any committed
        // block. No-op once stripped.
        if (ctx.repoRoot)
            stripGrapheneBlock(ctx.repoRoot);
    };
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const result = dispatch(ctx, name, args ?? {});
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [{ type: "text", text: JSON.stringify({ error: message }) }],
                isError: true,
            };
        }
    });
    return server;
}
function requireRepo(ctx) {
    if (!ctx.repoRoot) {
        throw new Error("Not in a git repository. Repo-specific tools are unavailable.");
    }
    return { repoRoot: ctx.repoRoot };
}
function dispatch(ctx, tool, args) {
    switch (tool) {
        case "global_read":
            return handleGlobalRead(ctx.globalDir, args);
        case "global_write":
            return handleGlobalWrite(ctx.globalDir, args);
        case "global_delete":
            return handleGlobalDelete(ctx.globalDir, args);
        default: {
            const { repoRoot } = requireRepo(ctx);
            switch (tool) {
                case "status":
                    return handleStatus(repoRoot, ctx.globalDir, args);
                case "read":
                    return handleRead(repoRoot, args);
                case "search":
                    return handleSearch(repoRoot, ctx.globalDir, args);
                case "upsert_node":
                    return handleUpsertNode(repoRoot, args);
                case "learn":
                    return handleLearn(repoRoot, args);
                case "link":
                    return handleLink(repoRoot, args);
                case "unlink":
                    return handleUnlink(repoRoot, args);
                case "stale":
                    return handleStale(repoRoot, args);
                case "remove_observation":
                    return handleRemoveObservation(repoRoot, args);
                case "delete_node":
                    return handleDeleteNode(repoRoot, args);
                case "batch":
                    return handleBatch(repoRoot, args);
                case "project_read":
                    return handleProjectRead(repoRoot, args);
                case "project_write":
                    return handleProjectWrite(repoRoot, args);
                case "project_delete":
                    return handleProjectDelete(repoRoot, args);
                default:
                    throw new Error(`Unknown tool: ${tool}`);
            }
        }
    }
}
//# sourceMappingURL=server.js.map