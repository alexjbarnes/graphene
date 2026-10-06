# Skills

Graphene ships three Claude Code skills, invoked as slash commands. One populates an empty graph, one refreshes a stale one, and one moves Claude Code's auto-memory into the graph. All three are thin: they drive the same MCP tools you could call by hand, in the right order, with the judgment calls spelled out.

## `/graphene:init`

Run this once per repo, when the graph is empty.

The agent maps the top-level structure, identifies 5 to 15 logical subsystems, and works out the four required fields for each: `summary`, `covers`, `entry_points`, and `type`. It reads HEAD for `last_commit`, then creates every node in a single `batch()` call. Edges go in the same batch. Observations for anything non-obvious follow with `learn()`.

The skill pushes hard on quality over count. Fewer complete nodes beat many thin ones. A node is meant to be answer-shaped, "where does permission handling happen end to end," not just a list of permission files. Cross-cutting concerns become edges, not nodes. If a node cannot be given a summary, `covers`, and `entry_points`, the skill says to skip it rather than create a stub.

The graph it produces lives under `.graphene/` in the repo, and is committed with the code, the same as any other file (see [Installation](installation.md)). The skill's last step is staging and committing it, not leaving a pile of new files sitting uncommitted.

Before that commit, `init` runs [`/graphene:migrate-memory`](#graphenemigrate-memory), so the first commit carries the project's existing memory too.

## `/graphene:refresh`

Run this when nodes have gone stale, or after a stretch of significant change.

It calls `stale()` to get the list, then for each stale node: reads the current node, reviews the changed files git reported, reads those files, and updates the node. That means setting `last_commit` to HEAD, adding observations for what is new, removing observations that no longer hold, and fixing `entry_points`, `covers`, or edges if the structure moved.

It starts with `changed` nodes, which carry concrete diffs to review, then handles `untracked` nodes by verifying their content and setting a `last_commit`. If a subsystem was deleted or merged, the skill uses `delete_node` to remove its node. After a full pass, the stale report should be empty.

See [Staleness](staleness.md) for what "stale" means and why bumping `last_commit` alone is the wrong fix.

## `/graphene:migrate-memory`

Run this whenever Claude Code's auto-memory holds files for the project. Graphene replaces auto-memory, because two memory systems means every future session has to check both, but memory still gets written: by sessions where graphene was not loaded, or by an agent following Claude Code's own memory instructions. The session-start hook lists any memory files it finds and points at this skill (see [Enforcement](enforcement.md#the-rules-block)).

It reads only this project's memory folder, `~/.claude/projects/<project>/memory/`, never another project's. Each memory is checked against the code first, and anything out of date is dropped rather than migrated. What still holds moves to its home:

- Code knowledge to `learn()` on the relevant node
- Project decisions and conventions to `project_write`
- Workflow preferences to `project_write`, or `global_write` if they span repos
- User feedback and corrections to `global_write` or `project_write`

It searches the graph before each write and skips what is already there, removes any observation a memory replaces, and keeps each observation within the [size limits](concepts.md#observations). Each memory file is deleted once everything in it is recorded or deliberately dropped, and `MEMORY.md` goes with the last one. The rule is strict: every memory file moves, nothing is left behind as a "workflow preference" exception. `CLAUDE.md` files are left alone, since they are instructions people wrote, often shared with teammates who do not run graphene.
