# Tools

Graphene exposes 17 MCP tools in three groups: reading, recording, and cleanup. This is the full reference. For the data model the tools operate on, see [Concepts](concepts.md).

## Reading

### `status()`

Returns the full session-start picture in one call: current HEAD, the node index (name, type, summary), up to three recent observations per node, stale nodes, project facts, and global facts. The enforcement hook injects this automatically on the first tool call of a session, so you rarely call it by hand. Call it to refresh after large changes.

### `read(name?)`

With no argument, returns the node index: every node's name, type, and summary. This is the map.

With a `name`, returns the full node: `entry_points`, `covers`, `last_commit`, `metadata`, all observations (with their ids), outgoing edges, and incoming dependents. Each edge and dependent carries the neighbor's summary, so one `read` shows you the node and its immediate context.

### `search(query)`

Full-text search across nodes, observations, project facts, global facts, and edge reasons. Multi-word queries match any word and rank results by how many words hit. Use it when you do not know which node owns what you are looking for.

### `stale()`

Returns the nodes whose covered files have changed since their `last_commit`, plus a fresh count and total. A node is stale when files under its `covers` patterns changed (`reason: "changed"`) or when it has no `last_commit` at all (`reason: "untracked"`). See [Staleness](staleness.md).

### `project_read(category?, subject?)`

Reads repo-scoped facts. No arguments returns all of them. Filter by `category`, or by `category` and `subject`.

### `global_read(category?, subject?)`

The same, for user-level facts that span repos.

## Recording

### `learn(node_name, content, source?)`

Appends an observation to a node. Append-only: it never overwrites an existing observation. The optional `source` records what triggered the learning. This is the workhorse for code knowledge, gotchas, and constraints.

### `upsert_node(name, fields)`

Creates a node, or merge-updates an existing one. Only the fields you pass change. `metadata` is shallow-merged rather than replaced. `type` is required when creating. The return value reports whether the node was `created`, `updated`, or left `unchanged`, and which fields changed.

### `link(from, to, type, reason)`

Creates an edge. Types: `depends_on`, `extends`, `related_to`, `mirrors`. The last two are bidirectional and create edges both ways. Idempotent: re-linking the same pair and type updates the `reason`.

### `batch({nodes, edges, observations})`

Creates or updates many nodes, edges, and observations in a single transaction. Pass three arrays. Each node uses the same fields as `upsert_node`. This is how `init` populates an empty graph in one shot. If any part fails, the whole transaction rolls back.

### `project_write(category, subject, content)`

Writes a repo-scoped fact. One fact per `category` + `subject` pair; writing to an existing pair replaces the content. Use it for conventions, decisions, and context that apply across the repo and do not belong on a single node.

### `global_write(category, subject, content)`

The same, for user-level facts that follow you across repos. Preferences, expertise, standing feedback.

## Cleanup

### `remove_observation(id)`

Deletes one observation by id. The id comes from a `read(name)` response. Use it when a recorded fact turns out to be wrong or outdated.

### `unlink(from, to, type?)`

Removes an edge. With a `type`, removes that specific edge. Without one, removes every edge between the two nodes.

### `delete_node(name)`

Deletes a node and, by cascade, all its edges and observations. Use it when a subsystem is removed from the codebase.

### `project_delete(category, subject)`

Removes one repo-scoped fact.

### `global_delete(category, subject)`

Removes one user-level fact.

## A typical session

1. The hook injects `status()` on the first tool call. The agent reads the index.
2. Before touching a subsystem, the agent calls `read(name)` to load its entry points, observations, and edges.
3. The agent works, using `entry_points` to skip the search it would otherwise repeat.
4. It records what it learns with `learn()` as it goes, not after.
5. On commit, the commit gate names the nodes the change touched. The agent updates each: `learn()` for what changed, `upsert_node()` for a new `last_commit`, and edges if relationships shifted.
