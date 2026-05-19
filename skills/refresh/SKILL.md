---
name: refresh
description: Review and update stale graphene nodes. Use when nodes are out of date or after significant code changes.
---

# Refresh Stale Graphene Nodes

## Current graph state

Call `stale` to see which nodes need attention, then for each stale node:

1. Call `read(name)` to see the current node detail
2. Review the changed files listed in the stale report
3. Read the changed files to understand what happened
4. Update the node:
   - `upsert_node(name, {last_commit: "<current HEAD>"})` to mark it current
   - Add observations with `learn(name, content)` for anything new you discovered
   - Update `entry_points` or `covers` if the file structure changed
   - Add or remove edges if relationships changed

## Guidelines

- Start with nodes marked "changed" (files modified since last_commit). These have concrete diffs to review.
- Nodes marked "untracked" (no last_commit) need their last_commit set to HEAD after verifying their content is accurate.
- Remove observations that are no longer true.
- If a node's subsystem was deleted or merged, use `delete_node(name)` to clean it up.
- After refreshing, the stale report should be empty.
