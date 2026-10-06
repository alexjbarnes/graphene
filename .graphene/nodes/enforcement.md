---
type: subsystem
summary: Claude Code hook layer: before-commit gate from staged files, bounded status injection (single and multi-repo), SessionStart rules; rules text in src/claude-md.ts
entry_points:
  - hooks/graphene-guard.mjs
  - hooks/hooks.json
  - src/claude-md.ts
covers:
  - hooks/
  - src/claude-md.ts
  - tests/hooks/
last_commit: c544f65
edges:
  - to: file-store type: depends_on reason: hook reads status and affected nodes through the store
  - to: mcp-tools type: depends_on reason: multi-repo status injection calls dist/server.js dispatch, the same path as the status tool
  - to: skills type: related_to reason: the SessionStart memory notice and rule 2 name /graphene:migrate-memory, so a rename must change both
---

- Rules block (the '## Graphene Context Graph' enforcement text) is injected by the SessionStart branch in hooks/graphene-guard.mjs, NOT written into CLAUDE.md. SessionStart fires on startup, resume, clear, and compact, so the rules re-enter context after every compaction. Registered in hooks/hooks.json under a new SessionStart event. <!-- id:4df0 -->
- Single source of truth for the rules text is src/claude-md.ts (export GRAPHENE_RULES). The hook imports it from compiled dist/claude-md.js so the hook and server never drift. Must rebuild dist after editing the rules. <!-- id:68aa -->
- Migration away from the old write-to-CLAUDE.md behavior: src/claude-md.ts stripGrapheneBlock() removes any legacy <!-- graphene --> block from a repo's CLAUDE.md. server.ts oninitialized calls it on startup. It preserves surrounding user content and deletes CLAUDE.md if the block was its only content. Idempotent: no-op when the start marker is absent. <!-- id:c949 -->
- The commit gate (PreToolUse on git commit, from STAGED files) and the post-commit reminder work per node: a node is flagged when its covers match a file in the commit but its own .graphene/nodes/<name>.md is not in it. That is the staleness rule in src/git.ts getUnreviewedFiles, so a silent gate means nothing reads stale from that commit; change both together. Multi-repo sessions inject per-repo status through dist/server.js dispatch, the same path as the status tool. <!-- id:49b7 -->
- GRAPHENE_RULES tells agents to remove an observation in the same step as recording its replacement, and to keep each to one point of at most 1,500 characters. When learn() refuses because a node is full, they must make room (remove superseded observations or split the node by topic) and then record; a red-flag row covers skipping the recording instead. The limits themselves are enforced in src/budget.ts. <!-- id:ca30 -->
- Status injection on the first tool call renders the bounded status through formatStatus: node index with observation counts, stale nodes, and project/global fact keys, never observation or fact bodies. The hook loads the store and server from compiled dist/, so it only sees src changes after a rebuild. <!-- id:4fd3 -->
- SessionStart appends a memory notice when the project's auto-memory folder holds any .md file. memoryNotice in hooks/graphene-guard.mjs takes the folder from the hook input's transcript_path (<project dir>/memory, beside the transcripts) instead of rebuilding Claude Code's folder name from cwd, lists up to 10 files, and names /graphene:migrate-memory, so rename the skill and the notice together. <!-- id:556e -->
