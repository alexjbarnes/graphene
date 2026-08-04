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
last_commit: 7325c61
edges:
  - to: file-store type: depends_on reason: hook reads status and affected nodes through the store
---

- Rules block (the '## Graphene Context Graph' enforcement text) is injected by the SessionStart branch in hooks/graphene-guard.mjs, NOT written into CLAUDE.md. SessionStart fires on startup, resume, clear, and compact, so the rules re-enter context after every compaction. Registered in hooks/hooks.json under a new SessionStart event. <!-- id:4df0 -->
- Single source of truth for the rules text is src/claude-md.ts (export GRAPHENE_RULES). The hook imports it from compiled dist/claude-md.js so the hook and server never drift. Must rebuild dist after editing the rules. <!-- id:68aa -->
- Migration away from the old write-to-CLAUDE.md behavior: src/claude-md.ts stripGrapheneBlock() removes any legacy <!-- graphene --> block from a repo's CLAUDE.md. server.ts oninitialized calls it on startup. It preserves surrounding user content and deletes CLAUDE.md if the block was its only content. Idempotent: no-op when the start marker is absent. <!-- id:c949 -->
- Deployment caveat: this change only goes live after the plugin is rebuilt, version + marketplace SHA bumped, and reinstalled. The currently installed plugin still runs the OLD write-to-CLAUDE.md path until reinstall, so it will recreate CLAUDE.md on session start in the interim. <!-- id:9de7 -->
- Shipped in v0.9.9: code change in commit 70a400e, released via bump commit cf59252. This is the first version where rules come from the SessionStart hook rather than a committed CLAUDE.md block. <!-- id:ccae -->
- v0.9.10: corrected the upsert_node signature in the injected rules (src/claude-md.ts GRAPHENE_RULES) from `upsert_node(name, fields)` to `upsert_node(name, ...)` with an explicit do-not-wrap note. Part of the silent-drop fix in src/tools/upsert-node.ts. Fix commit 0140dc7, released 483e523. See gotcha/upsert-node-input-contract. <!-- id:974a -->
- files branch (phase 02, commit a905a6f): hook's getStatus and getAffectedNodes now read the markdown file store via dist/store.js (listNodes/readNode), no database. formatStatus renders the bounded status shape: per-node observation counts, fact KEYS only (project_facts.count/keys), never observation or fact bodies. remove_observation rules line in src/claude-md.ts updated to (node, id). Commit-gate flip to before-commit guidance still pending in phase 06. <!-- id:e385 -->
- phase 03 (9276b4c): rules text project_read/write/delete lines in src/claude-md.ts gained the optional repo arg for multi-repo sessions. Full rules rewrite still owed in phase 06. <!-- id:f6c7 -->
- phase 04 (19cf28f): rules text gained one line for globals_export/globals_import in the Tools: recording section. <!-- id:dc18 -->
- phase 06 (7325c61): enforcement point moved to PreToolUse on git commit, computed from STAGED files vs node covers, silent when .graphene/ is staged alongside (graph riding the commit is the end state). PostToolUse is now only a light amend reminder when a commit touched covered files without .graphene/. Multi-repo sessions inject per-repo sectioned status through dist/server.js dispatch, the same code path as the status tool, so hook and tool can never drift. GRAPHENE_RULES rewritten: committed graph, update-before-commit rule, bounded status wording, multi-repo qualification section, new red-flag row for post-commit rationalization. <!-- id:ad7b -->
