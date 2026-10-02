---
type: subsystem
summary: MCP tool layer: tool schemas and single/multi-repo dispatch in src/server.ts, one handler per tool in src/tools/, git staleness helpers in src/git.ts, all IO through the file store
entry_points:
  - src/server.ts
  - src/tools/read.ts
  - src/tools/search.ts
covers:
  - src/server.ts
  - src/tools/
  - src/types.ts
  - src/git.ts
  - tests/tools/
  - tests/e2e.test.ts
  - tests/git.test.ts
last_commit: ff10d46
edges:
  - to: file-store type: depends_on reason: every handler reads and writes nodes and facts through src/store.ts
  - to: scope-routing type: depends_on reason: dispatchMulti resolves names and write targets through src/scope.ts
---

- read(name) is bounded: once a node passes READ_BUDGET (20,000 chars of observation text, src/tools/read.ts), observations over 200 chars come back as previews marked truncated, with an observations_note. Anything needing full text must use read(name, id); search feeds it by putting the id on observation results. routeRead in server.ts repeats the id-without-name guard because its index path never passes args to handleRead. <!-- id:2285 -->
- Staleness is per commit, not a plain diff: getUnreviewedFiles (src/git.ts) counts a commit that changes a node's covered files and its node file together as reviewed, because a node updated before git commit can only set last_commit to the parent. A file is stale only if it differs from last_commit and some commit changed it without the node file; a later node-only commit vouches for nothing before it. status and stale both call it, and the hook gate applies the same rule to staged files. <!-- id:2251 -->
