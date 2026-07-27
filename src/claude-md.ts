import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export const GRAPHENE_MARKER = "<!-- graphene -->";
export const GRAPHENE_MARKER_END = "<!-- /graphene -->";

// The standing rules block. The SessionStart hook injects this as context on
// startup, resume, and after compaction. It is no longer written into the
// repo's CLAUDE.md: committing CLAUDE.md should not drag graphene-specific
// instructions into repos whose collaborators do not run graphene.
export const GRAPHENE_RULES = `## Graphene Context Graph

### Rules
1. Do NOT read files, grep, or explore until you have called \`read(name)\` on every relevant node. The graph status is injected automatically on your first tool call. Read it.
2. Do NOT use auto-memory. Graphene replaces it. Use \`project_write()\` or \`global_write()\`.
3. You MUST record discoveries immediately. Not later. Not after the push. Now.
4. If the graph is empty, run \`/graphene:init\` or populate with \`batch()\` before doing anything else.

### You MUST record when
The trigger is what you learned, not whether a node exists. There is always a home: an existing node, a new node, or a project/global fact.
- You changed code: update the affected node with \`learn()\`, update summary/entry_points/covers if needed, set \`last_commit\`. No node covers it? Create one if it is a real subsystem, else \`project_write()\` the convention. Bumping \`last_commit\` alone is not sufficient.
- You discovered a boundary, constraint, gotcha, or workaround: \`learn(node, observation)\` or \`project_write()\`
- The user corrected you or stated a preference: \`project_write()\` if repo-specific, \`global_write()\` if cross-repo. If unsure, ask.
- You spent 3+ tool calls finding something: record where you found it

### Tools: reading
- \`status()\` - auto-injected at session start. Call manually to refresh.
- \`read()\` - no args returns full node index. \`read(name)\` returns node detail: entry_points, observations, edges, dependents.
- \`search(query)\` - search across nodes, observations, project facts, global facts, and edge reasons. Multi-word queries match any word, ranked by relevance.
- \`stale()\` - check which nodes have changed files since their last_commit.
- \`project_read(category?, subject?, repo?)\` - read project facts. No args returns all.
- \`global_read(category?, subject?)\` - read global facts. No args returns all.

### Tools: recording
- \`learn(node, content)\` - append an observation to a node. Use for code knowledge, gotchas, boundaries.
- \`upsert_node(name, ...)\` - create or update a node. Pass each field as a top-level arg (summary, covers, entry_points, last_commit, metadata, type), the same shape as a node in \`batch\`. Do NOT wrap them in a \`fields\` object. Only provided fields change on update; metadata shallow-merges.
- \`link(from, to, type, reason)\` - create edge. Types: depends_on, extends, related_to, mirrors. related_to and mirrors are bidirectional.
- \`batch({nodes, edges, observations})\` - bulk create/update in one transaction.
- \`project_write(category, subject, content, repo?)\` - repo-specific conventions, decisions, preferences.
- \`global_write(category, subject, content)\` - cross-repo user preferences.

### Tools: cleanup
- \`remove_observation(node, id)\` - delete a wrong or outdated observation (id from read response).
- \`unlink(from, to, type?)\` - remove an edge. Omit type to remove all edges between the pair.
- \`delete_node(name)\` - remove a node and all its edges and observations.
- \`project_delete(category, subject, repo?)\` - remove a project fact.
- \`global_delete(category, subject)\` - remove a global fact.

### Red flags (you are rationalizing if you think these)
| Thought | Reality |
|---------|---------|
| "I already know this codebase" | You do not. Read the graph. Prior sessions recorded what they found. |
| "I'll just grep for it" | Check the graph first. The answer may already be there. |
| "I'll update graphene later" | No. Update as you go. You will forget. |
| "I'll just bump last_commit" | Not enough. Review and update observations, summary, entry_points. |
| "This change is too small to record" | Small discoveries compound. Record it. |
| "This is just a fix, not a discovery" | Constraints and boundaries ARE discoveries. Record them. |
| "No node covers this file, so nothing to record" | Wrong. Absence of a node is a gap. Create one if it is a real subsystem, else \`project_write()\` the convention. |
| "I'll keep this in memory instead" | No. Graphene replaces memory. Use project_write or global_write. |`;

// One-time migration. Earlier versions wrote GRAPHENE_RULES into the repo's
// CLAUDE.md between the markers. This removes that block if present, preserving
// any surrounding user content, and deletes CLAUDE.md outright if the block was
// its only content. Legacy installs that lack the end marker had the block run
// to end of file, so everything from the start marker onward is dropped.
// Idempotent: with no start marker present it does nothing.
export function stripGrapheneBlock(repoRoot: string): void {
  const claudeMdPath = join(repoRoot, "CLAUDE.md");
  if (!existsSync(claudeMdPath)) return;

  const content = readFileSync(claudeMdPath, "utf-8");
  const startIndex = content.indexOf(GRAPHENE_MARKER);
  if (startIndex === -1) return;

  const endMarkerIndex = content.lastIndexOf(GRAPHENE_MARKER_END);
  const after =
    endMarkerIndex !== -1
      ? content.slice(endMarkerIndex + GRAPHENE_MARKER_END.length)
      : "";

  const parts = [
    content.slice(0, startIndex).replace(/\s+$/, ""),
    after.replace(/^\s+/, ""),
  ].filter((part) => part !== "");

  if (parts.length === 0) {
    unlinkSync(claudeMdPath);
    return;
  }
  writeFileSync(claudeMdPath, parts.join("\n\n") + "\n");
}
