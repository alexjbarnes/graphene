---
type: module
summary: Globals export/import: portable markdown bundle, merge-by-key import, MCP tools plus CLI subcommands (v0.11 files branch)
entry_points:
  - src/globals-sync.ts
covers:
  - src/globals-sync.ts
  - tests/globals-sync.test.ts
last_commit: 19cf28f
---

- Bundle parsing constraint: section headers match only slug-shaped '## category / subject' lines, so markdown h2 headings inside fact content cannot split sections. CLI uses process.exitCode, never process.exit, because exit() truncates piped stdout on POSIX (verified empirically under execFileSync). Import is per-fact, not transactional, matching global_write semantics; batch() is the codebase's one transactional exception. <!-- id:921d -->
