---
type: subsystem
summary: MCP tool layer: tool schemas and single/multi-repo dispatch in src/server.ts, one handler per tool in src/tools/, all IO through the file store
entry_points:
  - src/server.ts
  - src/tools/read.ts
  - src/tools/search.ts
covers:
  - src/server.ts
  - src/tools/
  - src/types.ts
  - tests/tools/
  - tests/e2e.test.ts
last_commit: e53773f
edges:
  - to: file-store type: depends_on reason: every handler reads and writes nodes and facts through src/store.ts
  - to: scope-routing type: depends_on reason: dispatchMulti resolves names and write targets through src/scope.ts
---

- read(name) is bounded: once a node passes READ_BUDGET (20,000 chars of observation text, src/tools/read.ts), observations over 200 chars come back as previews marked truncated, with an observations_note. Anything needing full text must use read(name, id); search feeds it by putting the id on observation results. routeRead in server.ts repeats the id-without-name guard because its index path never passes args to handleRead. <!-- id:2285 -->
