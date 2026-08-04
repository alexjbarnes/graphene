---
type: subsystem
summary: Markdown file storage layer replacing SQLite: parse/serialize node and fact files, slug validation, atomic IO (v0.11 files branch)
entry_points:
  - src/store.ts
covers:
  - src/store.ts
  - tests/store.test.ts
last_commit: df22d4b
---

- Store format invariants (v0.11): slugs are /^[a-z0-9_][a-z0-9._-]*$/ with "__" additionally banned ("__" is the fact filename separator, so allowing it would collide ("a__b","c") with ("a","b__c")). Path constructors nodePath/factFileName are the validation chokepoint, every read/write/delete goes through them, so traversal-shaped names never touch the filesystem. Observation ids are 4-hex sha256 prefixes with -2/-3 suffixes on collision. appendLineVerified repairs the O_APPEND-vs-rename race by re-reading and rewriting atomically once. No timestamps stored anywhere: body order is history, git carries dates. <!-- id:bb20 src:phase-01 build, commit df22d4b -->
