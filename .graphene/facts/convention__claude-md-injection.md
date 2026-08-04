---
category: convention
subject: claude-md-injection
---

Graphene must never write its rules block into a repo's committed CLAUDE.md. Orgs commit CLAUDE.md, and non-graphene collaborators should not inherit graphene-specific instructions. The rules are injected at runtime by the SessionStart hook, sourced from src/claude-md.ts (GRAPHENE_RULES). To change the rules: edit src/claude-md.ts, then rebuild dist. server.oninitialized strips any legacy committed block as a one-time migration.
