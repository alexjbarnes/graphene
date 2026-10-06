---
type: subsystem
summary: Plugin slash-command skills: init populates an empty graph, refresh reviews stale nodes, migrate-memory moves the project's Claude Code auto-memory into the graph
entry_points:
  - skills/init/SKILL.md
  - skills/refresh/SKILL.md
  - skills/migrate-memory/SKILL.md
covers:
  - skills/
  - docs/skills.md
last_commit: c544f65
edges:
  - to: enforcement type: related_to reason: the SessionStart memory notice and rule 2 name /graphene:migrate-memory, so a rename must change both
---

- init runs /graphene:migrate-memory as step 7, before its commit step, so one commit carries the new graph and the moved memory; on a populated graph, run migrate-memory alone, since rerunning init rebatches every node and resets last_commit without review. migrate-memory reads only this project's memory folder, never ~/.claude/projects/*/memory (other folders hold other repos' memories), and leaves CLAUDE.md alone because it is shared instructions, not memory. Its !`ls` line rebuilds the folder name from cwd (every non-alphanumeric character becomes '-'); the session-start notice's path wins if they differ. <!-- id:b8c0 -->
