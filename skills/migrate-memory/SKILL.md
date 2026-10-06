---
name: migrate-memory
description: Move this project's Claude Code auto-memory files into the graphene graph, then delete them. Use when the session-start notice lists memory files, or whenever auto-memory has been written despite graphene.
---

# Migrate Auto-Memory into Graphene

Graphene replaces auto-memory. Two memory systems means every future session has to check both, so every memory file moves into the graph and is then deleted. No exceptions: do not leave some behind as "workflow preferences". `project_write` and `global_write` exist for exactly that kind of knowledge.

## This project's memory folder

!`ls -la ~/.claude/projects/$(pwd | sed 's/[^A-Za-z0-9]/-/g')/memory 2>/dev/null || echo "No memory folder at the default location."`

If the session-start notice or your system prompt names a different memory folder, use that one. Only ever migrate this project's folder: the other folders under `~/.claude/projects/` belong to other repos.

## Process

1. Read the graph before writing to it: the status injected on your first tool call, and `read(name)` on every node a memory touches.
2. Check each memory against the code. Drop anything wrong or out of date instead of migrating it.
3. Move what still holds to its home:
   - Code knowledge ("auth middleware is in src/middleware, not src/auth") -> `learn(node_name, content)` on the relevant node. No node fits? Create one if it is a real subsystem, else `project_write`.
   - Project decisions and conventions ("NODE_ENV must not be set for builds") -> `project_write("convention", subject, content)`.
   - Workflow preferences ("don't start the dev server") -> `project_write("preference", subject, content)` if repo-specific, `global_write("preference", subject, content)` if cross-repo.
   - User feedback and corrections ("prefer single PRs for refactors") -> `global_write("feedback", subject, content)` or `project_write("feedback", subject, content)`.
   - If the scope is unclear, ask the user.
4. `search()` before each write. If the graph already says it, skip it. If the memory replaces an existing observation, `remove_observation` the old one in the same step.
5. Keep each observation to one point, at most 1,500 characters, splitting a long memory into several. If `learn()` refuses because the node is full, make room first (remove superseded observations, or split the node by topic), then record.
6. Delete each memory file once everything in it is recorded or deliberately dropped, and remove its line from `MEMORY.md`. Delete `MEMORY.md` too once it lists nothing.
7. Stage the `.graphene/` changes so they ride the next commit.

Leave `CLAUDE.md` files alone. They are instructions people wrote, often shared with teammates who do not run graphene, not memory.
