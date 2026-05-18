<!-- graphene -->
## Graphene Context Graph

This project has a persistent context graph managed by the Graphene MCP server. It tracks subsystems, relationships, and learned observations across sessions. You must use it.

### Before anything else
1. Call `status`. It returns the node index, stale nodes, and user preferences.
2. Identify which nodes are relevant to your task.
3. Call `read(name)` on each relevant node. It contains entry_points (where to start reading), observations (what prior sessions learned), and edges (related subsystems).

Do not skip these steps. Do not start reading files, grepping, or exploring until you have checked the graph. The graph exists to prevent wasted tool calls. Even if it turns out not to help, reading a node is faster than grepping through wrong files.

### Before claiming something doesn't exist
- Check the edges on related nodes. The feature may live in a connected subsystem.
- Use `search(query)` to check observations from prior sessions.

### After changing code
- Update `last_commit` on affected nodes: `upsert_node(name, {last_commit: "<current HEAD>"})`

### When you learn something
- Found code somewhere unexpected: `learn(node_name, content)`
- Spent 3+ tool calls locating something: record where you found it.
- Discovered a cross-cutting relationship: `link(from, to, type, reason)`
- Something you assumed was wrong: remove the old observation, add the correction.

### First session (empty graph)
If `status` returns an empty node list, explore the codebase and populate with `batch()`. Every node must include:
- `summary`: one-line purpose statement. Without this, the index is just a list of names.
- `covers`: file/directory patterns (e.g. `["src/auth/"]`). Without this, staleness tracking cannot work.
- `entry_points`: key files to start reading (e.g. `["src/auth/router.ts", "src/auth/middleware.ts"]`).
- `last_commit`: set to current HEAD so staleness tracking starts immediately.

A node without summary, covers, and entry_points is useless. Prefer fewer complete nodes over many empty ones.
<!-- /graphene -->
