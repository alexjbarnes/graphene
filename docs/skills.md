# Skills

Graphene ships two Claude Code skills, invoked as slash commands. One populates an empty graph. The other refreshes a stale one. Both are thin: they drive the same MCP tools you could call by hand, in the right order, with the judgment calls spelled out.

## `/graphene:init`

Run this once per repo, when the graph is empty.

The agent maps the top-level structure, identifies 5 to 15 logical subsystems, and works out the four required fields for each: `summary`, `covers`, `entry_points`, and `type`. It reads HEAD for `last_commit`, then creates every node in a single `batch()` call. Edges go in the same batch. Observations for anything non-obvious follow with `learn()`.

The skill pushes hard on quality over count. Fewer complete nodes beat many thin ones. A node is meant to be answer-shaped, "where does permission handling happen end to end," not just a list of permission files. Cross-cutting concerns become edges, not nodes. If a node cannot be given a summary, `covers`, and `entry_points`, the skill says to skip it rather than create a stub.

### Memory migration

`init` also migrates existing agent memory into graphene, because two memory systems means every future session has to check both. It moves:

- Workflow preferences to `project_write` or `global_write`
- Code knowledge to `learn()` on the relevant node
- Project decisions and conventions to `project_write`
- User feedback and corrections to `global_write` or `project_write`

After migrating, it deletes the old memory files and cleans up `MEMORY.md`. The rule is strict: every memory file moves, nothing is left behind as a "workflow preference" exception.

## `/graphene:refresh`

Run this when nodes have gone stale, or after a stretch of significant change.

It calls `stale()` to get the list, then for each stale node: reads the current node, reviews the changed files git reported, reads those files, and updates the node. That means setting `last_commit` to HEAD, adding observations for what is new, removing observations that no longer hold, and fixing `entry_points`, `covers`, or edges if the structure moved.

It starts with `changed` nodes, which carry concrete diffs to review, then handles `untracked` nodes by verifying their content and setting a `last_commit`. If a subsystem was deleted or merged, the skill uses `delete_node` to remove its node. After a full pass, the stale report should be empty.

See [Staleness](staleness.md) for what "stale" means and why bumping `last_commit` alone is the wrong fix.
