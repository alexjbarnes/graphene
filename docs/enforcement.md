# Enforcement

A graph nobody reads or updates is dead weight. The hard problem graphene solves is not storage, it is getting the agent to use the store. Instructions alone do not do it. Agents skip the read and forget the write.

The enforcement layer makes the right action show up at the right moment. It is a set of Claude Code hooks plus an auto-injected `CLAUDE.md` block. All of it is additive: it injects context, it does not block tool calls.

## The hook script

One script, `hooks/graphene-guard.mjs`, handles every event. It reads the event name and tool name from stdin and branches. `hooks/hooks.json` registers it on three triggers:

- `PreToolUse` on all tools
- `PostToolUse` on graphene's own MCP tools
- `PostToolUse` on `Bash`

The script imports graphene's compiled `dist/` to open the database and call the same `status` logic the MCP server uses, so the hook and the server never drift apart.

## Status injection

On the first tool call of a session, the `PreToolUse` hook injects the current graph as context: HEAD, the node index with a few recent observations each, stale nodes, and the project and global facts. The agent sees the map before it touches anything.

The hook injects once per session and then sets a flag so it does not repeat. Graphene tool calls are skipped, so reading the graph never triggers another reminder about reading the graph. If the working directory is not a git repo, the hook exits quietly and does nothing.

The injected block ends with the standing rules: call `read(name)` before working on a subsystem, and update affected nodes after changing code.

## The commit gate

This is the part that catches the write nobody remembers to do.

After every `Bash` call, the `PostToolUse` hook checks the command. On `git commit`, it reads the files in the new commit (`git diff-tree` against HEAD) and compares them against every node's `covers` patterns. For each node whose files the commit touched, it emits a reminder naming the node and the matching files, with a four-step checklist:

1. Record what changed with `learn(node, observation)`
2. Update the summary if the purpose shifted
3. Update `entry_points` and `covers` if files were added or renamed
4. Set `last_commit` to the new HEAD

It states plainly that bumping `last_commit` alone is not enough. The point of the gate is the observation, not the timestamp.

On `git push`, a lighter reminder tells the agent to verify that every node touched by the pushed commits has updated observations and `last_commit`.

## Session state

The hook tracks per-session state in `~/.graphene/sessions/<session_id>.json`: whether status was injected, the last interaction time, the last write time, and the session start. Each session gets its own file, so concurrent sessions do not collide. A corrupt or missing file falls back to defaults, which at worst means one extra status injection.

Cleanup is lazy. On roughly one call in a hundred, the hook sweeps the sessions directory and deletes state files older than seven days. There is no daemon and no scheduled job.

## The CLAUDE.md block

When the MCP server starts in a repo, it writes a graphene section into that repo's `CLAUDE.md`, wrapped in `<!-- graphene -->` markers. The block holds the rules, the recording triggers, the full tool list, and a table of rationalizations with their rebuttals ("No node covers this file, so nothing to record" answered by "Absence of a node is a gap, create one or write a project fact").

The markers let the server replace its own block on later runs without disturbing the rest of your `CLAUDE.md`. Edits you make outside the markers are left alone. Edits inside the markers are overwritten on the next run, so customize the template in `src/server.ts`, not in the generated file.

## Soft by design

Every hook injects context through `additionalContext`. None of them denies a tool call. The agent is reminded, not gated. This keeps a missing graph or a hook error from ever blocking your work. The trade-off is that enforcement depends on the agent acting on the reminder. If reminders stop being enough, the hooks can be upgraded to hard `deny` decisions without changing the rest of the system.
