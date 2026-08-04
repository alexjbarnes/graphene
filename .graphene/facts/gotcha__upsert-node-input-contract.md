---
category: gotcha
subject: upsert-node-input-contract
---

upsert_node (and each node in batch) takes fields as TOP-LEVEL args: name, type, summary, entry_points, covers, last_commit, metadata. Bug (FIXED in v0.9.10, commit 0140dc7): handleUpsertNode read only top-level fields and SILENTLY returned status "unchanged", dropping the write, when a caller wrapped fields in a `fields` object or JSON string. Models infer that wrapper from the old `upsert_node(name, fields)` doc signature, so recordings were lost without error. Fix in src/tools/upsert-node.ts normalizeArgs(): unwrap a `fields` wrapper (object or JSON-string), coerce JSON-stringified metadata/entry_points/covers, reject unknown keys, and THROW instead of returning "unchanged" when an existing-node update carries no recognized fields. Rules text (src/claude-md.ts) and docs/tools.md signature changed to `upsert_node(name, ...)` with a do-not-wrap note. Lesson: recording tools must fail loud, never silently no-op.
