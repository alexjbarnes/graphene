# Staleness

A context graph rots. Code changes, the notes do not, and the agent ends up trusting a description of a function that no longer exists. Graphene detects its own drift by comparing what each node claims to cover against what git says actually changed.

## How it works

Two fields drive it: `covers` and `last_commit`.

- **covers** is the set of path patterns a node owns, like `["src/auth/", "src/middleware/auth"]`.
- **last_commit** is the commit the node was last verified against.

To check a node, graphene asks git for the files that changed between the node's `last_commit` and current HEAD, restricted to the node's `covers` paths. If anything comes back, the node is stale.

This runs in `status()` (injected at session start) and on demand through `stale()`.

## The two kinds of stale

- **changed**: the node has a `last_commit`, and files under its `covers` changed since then. The stale report lists the exact files, so the agent knows what to read before updating the node.
- **untracked**: the node has no `last_commit` at all. There is nothing to diff against, so graphene cannot vouch for it. It needs review and a `last_commit` set to HEAD once verified.

A node with a `last_commit` but no `covers` is never flagged as changed. It has nothing to compare, so it counts as fresh. That is why a node without `covers` is a blind spot: the commit gate and staleness both key off `covers`, and a node that covers nothing is invisible to both.

## Choosing covers patterns

The patterns decide how good staleness is. Get them wrong in either direction and the signal degrades.

- **Too narrow** and real changes slip past. If a node covers `src/auth/router.ts` but the logic moved to `src/auth/handlers.ts`, the move goes unnoticed.
- **Too broad** and the node cries wolf. A node that covers `src/` flags as stale on nearly every commit, and constant false alarms train the agent to ignore the report.

Aim for the directory or directories the subsystem actually lives in. `["src/auth/"]` is usually better than listing individual files, because it survives renames within the subsystem while still ignoring changes elsewhere.

## Keeping nodes fresh

When a node is stale, the fix is not to bump `last_commit`. That clears the flag without doing the work, and leaves the observations describing old code.

The real refresh: read the changed files, update or remove observations that no longer hold, adjust `entry_points` and `covers` if the structure moved, then set `last_commit` to HEAD. The [`refresh` skill](skills.md) walks through exactly this for every stale node in one pass. After it runs, the stale report should be empty.
