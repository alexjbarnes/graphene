---
type: subsystem
summary: One-time legacy SQLite to markdown migration: context.db/global.db readers, name normalization, gitignore rewrite (v0.11 files branch)
entry_points:
  - src/migrate.ts
covers:
  - src/migrate.ts
  - tests/migrate.test.ts
last_commit: c9d9695
edges:
  - to: file-store type: depends_on reason: writes migrated nodes and facts through the store
---

- node:sqlite gotchas learned in phase 05: the readonly option key is camelCase readOnly; lowercase readonly is SILENTLY IGNORED and even auto-creates a missing file read-write. readOnly is documented since v22.12.0 while node:sqlite itself exists from v22.5, so on 22.5-22.11 the open is silently read-write (acceptable here: migration only SELECTs). Loaded via createRequire lazily so repos with nothing to migrate never touch node:sqlite and older Node keeps working. Legacy names normalize: lowercase, invalid runs to '-', collapse, de-collide with -2/-3; renamed nodes get a migration observation and edges follow renames on both endpoints. <!-- id:a093 -->
- This repo own graph migrated at the v0.11.0 release: 6 nodes, 5 facts, zero renames. context.db renamed context.db.migrated, global.db migrated the same way. <!-- id:283e src:release -->
