---
type: subsystem
summary: MCP tool layer: server entry and startup (src/index.ts), tool schemas and single/multi-repo dispatch in src/server.ts, one handler per tool in src/tools/, write-time size limits in src/budget.ts, git staleness helpers in src/git.ts, all IO through the file store
entry_points:
  - src/server.ts
  - src/tools/read.ts
  - src/tools/search.ts
covers:
  - src/index.ts
  - src/server.ts
  - src/budget.ts
  - src/tools/
  - src/types.ts
  - src/git.ts
  - tests/tools/
  - tests/e2e.test.ts
  - tests/git.test.ts
last_commit: 2ae06f4
edges:
  - to: file-store type: depends_on reason: every handler reads and writes nodes and facts through src/store.ts
  - to: scope-routing type: depends_on reason: dispatchMulti resolves names and write targets through src/scope.ts
---

- Staleness is per commit, not a plain diff: getUnreviewedFiles (src/git.ts) counts a commit that changes a node's covered files and its node file together as reviewed, because a node updated before git commit can only set last_commit to the parent. A file is stale only if it differs from last_commit and some commit changed it without the node file; a later node-only commit vouches for nothing before it. status and stale both call it, and the hook gate applies the same rule to staged files. <!-- id:2251 -->
- Node size is enforced at write time in src/budget.ts: learn() and batch() refuse an observation over OBSERVATION_LIMIT (1,500 chars), and any write that would take a node past READ_BUDGET (20,000 chars of observation text), with batch counting each node's additions together. The refusal lists the node's five largest observations so the agent can make room. read(name) still previews long observations for nodes already past the budget (grown before the limit, or hand-edited), and read(name, id) returns one in full; search puts observation ids on its results for that. <!-- id:134c -->
- routeStatus bounds a wide session with MAX_DETAILED_REPOS (20): at or under 20 repos every repo gets a full entry as before; past 20, only repos with a graph (a node or a project fact, hasGraph) get an entry and the rest go in without_graph {count, repos} capped by boundedKeys; past 20 repos WITH a graph, each entry shrinks to {repo, node_count, stale (names), project_fact_count}. Graphless repos never reach handleStatus in wide mode, so a zero-commit graphless sibling is just named, not an error entry. read takes an optional repo that narrows the scopes; it is dispatched in dispatch() itself (beside project_*), not in the single/multi tables, because the result shape follows the session's repo count while the lookup follows the narrowed one. <!-- id:cf87 -->
