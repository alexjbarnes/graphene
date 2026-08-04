---
category: constraint
subject: plugin-dependency-install
---

Claude Code npm-installs a plugin dependencies at install time (verified empirically: dev tree appears under ~/.claude/plugins/cache/graphene/graphene/<version>/node_modules). Since v0.11.0 graphene has ONE runtime dependency (@modelcontextprotocol/sdk, pure JS): storage is markdown files, migration reads legacy dbs via the node:sqlite builtin. No native modules, nothing to compile, installs everywhere.
