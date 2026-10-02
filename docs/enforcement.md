# Enforcement

A graph nobody reads or updates is dead weight. The hard problem graphene solves is not storage, it is getting the agent to use the store. Instructions alone do not do it. Agents skip the read and forget the write.

The enforcement layer makes the right action show up at the right moment. It is a set of Claude Code hooks. All of it is additive: it injects context, it does not block tool calls.

## The hook script

One script, `hooks/graphene-guard.mjs`, handles every event. It reads the event name and tool name from stdin and branches. `hooks/hooks.json` registers it on four triggers:

- `SessionStart` on every session (startup, resume, clear, compact)
- `PreToolUse` on all tools
- `PostToolUse` on graphene's own MCP tools
- `PostToolUse` on `Bash`

The script imports graphene's compiled `dist/` to read the graph and call the same `status` and `dispatch` logic the MCP server uses, so the hook and the server never drift apart.

## Status injection

On the first tool call of a session, the `PreToolUse` hook injects the current graph as context. The injection is bounded, the same shape `status()` itself returns: HEAD, the node index with observation counts (never the observations themselves), stale nodes, and project and global fact counts and keys. The agent sees the map before it touches anything, and calls `read(name)`, `project_read()`, or `global_read()` for anything the map only names.

If the working directory is itself a git repo, that repo is the only scope in play, and the injection is exactly what a single-repo `status()` call returns. If it is not, the hook looks for child repos beneath the working directory instead. Finding none, it does nothing, the same as a plain non-repo directory. Finding one or more, it builds a session covering all of them and injects one section per repo (`=== repo-name ===`), with a repo whose own status call failed rendered as `status unavailable: <error>` instead of taking down the whole injection, and the global facts printed once at the end rather than once per repo. See [multi-repo sessions](tools.md#multi-repo-sessions).

The hook injects once per session and then sets a flag so it does not repeat. Graphene tool calls are skipped, so reading the graph never triggers another reminder about reading the graph.

The injected block ends with the standing rules: call `read(name)` before working on a subsystem, and update affected nodes after changing code.

## The commit gate

This is the part that catches the write nobody remembers to do. The graph is committed with the code (see [Installation](installation.md)), so the goal is not just recording a change somewhere, it is getting the `.graphene/` update into the same commit as the code it describes.

**Before the commit.** The same `PreToolUse` hook that injects status also watches every `Bash` command for one that matches `git commit`. When it finds one, it reads the currently staged files (`git diff --cached --name-only`) and compares them against every node's `covers` patterns. If a node covers a staged file and its own node file (`.graphene/nodes/<name>.md`) is not staged, it injects:

```
You are about to commit. These graphene nodes cover staged files, but their node files are not staged:
  - <node> (<files>)

Update them NOW (learn / upsert_node / last_commit) and stage their .graphene/nodes/ files, so the graph rides this commit. A node whose file is not in the commit reads as stale afterwards. Then re-run the commit.
```

The check is per node, and it is the rule [staleness](staleness.md#updates-that-ride-the-commit) applies once the commit exists: a change to a node's covered files counts as reviewed when the node's own file changes in the same commit. Staging some other node's file does not quiet it, and a silent gate means no node will read as stale from this commit.

This fires before the commit exists, while the agent can still fold the graph update into it. Like every other injection here, it is additive: it does not deny the tool call, and it does not stop the commit from running if the agent goes ahead anyway.

**After the commit.** A lighter `PostToolUse` follow-up runs once the commit has actually happened, reading the files it touched (`git diff-tree --no-commit-id --name-only -r HEAD`, against the new HEAD). It stays silent when the commit already carried the node file of every node whose covered files it touched, which is the outcome the pre-commit gate exists to produce, and silent too when the commit touched no covered files at all. Only when a node's covered files changed and its node file was left out does it speak up, naming those nodes:

```
This commit touched files these graphene nodes cover, but their node files were not part of it:
  - <node> (<files>)

Update them and set last_commit to this commit, then `git commit --amend` (or a follow-up commit), so the graph catches up.
```

Setting `last_commit` to the commit matters for the follow-up route: a later commit that only touches the node file does not vouch for code that changed before it.

**Multi-repo sessions.** Both gates stay single-repo. A commit always runs with its cwd inside one specific repo, so the hook's ordinary repo-root detection already answers the question, with no need to consult the session's full scope list. In a multi-repo session (see [multi-repo sessions](tools.md#multi-repo-sessions)) the gates simply do not fire, the same as they would not for a command run outside any repo at all.

On `git push`, a separate reminder tells the agent to verify that every node touched by the pushed commits has updated observations and `last_commit`.

## Session state

The hook tracks per-session state in `~/.graphene/sessions/<session_id>.json`: whether status was injected, the last interaction time, the last write time, and the session start. Each session gets its own file, so concurrent sessions do not collide. A corrupt or missing file falls back to defaults, which at worst means one extra status injection.

Cleanup is lazy. On roughly one call in a hundred, the hook sweeps the sessions directory and deletes state files older than seven days. There is no daemon and no scheduled job.

## The rules block

On `SessionStart`, which fires at startup, on resume, and after compaction, the hook injects the standing rules block as context: the rules, the recording triggers, multi-repo session behavior, the full tool list, and a table of rationalizations with their rebuttals ("No node covers this file, so nothing to record" answered by "Absence of a node is a gap, create one or write a project fact"). The rules also state plainly that the graph is committed with the code and must be updated before `git commit`, not after, which is what the gate above enforces moment to moment. The text lives in `src/claude-md.ts` and the hook imports it from the compiled `dist/`, so the hook and the server never drift. Injecting after compaction is what keeps the rules in context once the original session start scrolls out.

Earlier versions wrote this block into the repo's `CLAUDE.md` between `<!-- graphene -->` markers. That dragged graphene-specific instructions into committed `CLAUDE.md` files for teammates who do not run graphene, so the write was dropped. The MCP server now does the reverse on startup: if it finds a committed block it strips it, preserving the rest of the file and removing `CLAUDE.md` entirely if the block was its only content. The strip is a one-time migration and a no-op once done.

## Soft by design

Every hook injects context through `additionalContext`. None of them denies a tool call. The agent is reminded, not gated. This keeps a missing graph or a hook error from ever blocking your work. The trade-off is that enforcement depends on the agent acting on the reminder. If reminders stop being enough, the hooks can be upgraded to hard `deny` decisions without changing the rest of the system.
