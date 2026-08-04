---
type: subsystem
summary: Multi-repo scope discovery and routing layer: parent-dir sessions aggregate reads and route writes to the owning repo (v0.11 files branch)
entry_points:
  - src/scope.ts
covers:
  - src/scope.ts
  - tests/scope.test.ts
  - tests/multi-repo.test.ts
last_commit: 9276b4c
edges:
  - to: file-store type: depends_on reason: resolves and routes against store reads
---

- Key invariants: single-scope dispatch is byte-identical to pre-multi behavior (the whole tools test suite is the regression guard). Scope names are RELATIVE PATHS from session cwd, so they are session-local and must never be persisted into node files; this is why cross-repo edges are rejected outright. Write routing votes: qualified name wins, else covers/entry_points paths tested cwd-relative then repo-relative-on-disk, must be unanimous. Paths are rewritten repo-relative before storage. status degrades per-scope (a zero-commit sibling repo yields an error entry, not session failure); stale never reads HEAD so it does not need the same guard. <!-- id:9b93 -->
