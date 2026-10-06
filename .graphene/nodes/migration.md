---
type: subsystem
summary: One-time legacy SQLite to markdown migration: context.db/global.db readers, name normalization, gitignore rewrite (v0.11 files branch)
entry_points:
  - src/migrate.ts
covers:
  - src/migrate.ts
  - tests/migrate.test.ts
last_commit: c544f65
edges:
  - to: file-store type: depends_on reason: writes migrated nodes and facts through the store
---

- node:sqlite gotchas learned in phase 05: the readonly option key is camelCase readOnly; lowercase readonly is SILENTLY IGNORED and even auto-creates a missing file read-write. readOnly is documented since v22.12.0 while node:sqlite itself exists from v22.5, so on 22.5-22.11 the open is silently read-write (acceptable here: migration only SELECTs). Loaded via createRequire lazily so repos with nothing to migrate never touch node:sqlite and older Node keeps working. Legacy names normalize: lowercase, invalid runs to '-', collapse, de-collide with -2/-3; renamed nodes get a migration observation and edges follow renames on both endpoints. <!-- id:a093 -->
- A legacy db next to an existing file graph is never imported: migrateRepo/migrateGlobal return leftover: true when any .md file exists in .graphene/nodes or .graphene/facts (global: in the global dir), and tryMigrate in src/index.ts logs it before node:sqlite loads. Leftovers come from old sql.js servers, which write their in-memory db back to context.db after the migration renamed it, and from local dbs in clones of repos whose graph is committed. Importing one overwrites newer files and brings back deleted nodes. Trade-off: a first migration that fails partway leaves files, so its retry becomes a leftover skip. Writes are not rolled back, because a rollback could delete a concurrent start's finished migration. <!-- id:9085 -->
