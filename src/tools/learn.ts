import { readNode, appendLineVerified, observationId, nodePath } from "../store.js";

// Mirrors store.ts's private serializeObservation/serializeBody format
// (neither is exported, and store.ts is not to be modified in this phase):
// one bullet, continuation lines indented two spaces, id/source marker
// anchored at the end of the (possibly multi-line) text.
function serializeObservationLine(content: string, id: string, source: string | null): string {
  const marker = source !== null ? ` <!-- id:${id} src:${source} -->` : ` <!-- id:${id} -->`;
  const lines = content.split("\n").map((line, i) => (i === 0 ? `- ${line}` : `  ${line}`));
  lines[lines.length - 1] += marker;
  return lines.join("\n") + "\n";
}

export function handleLearn(
  repoRoot: string,
  args: Record<string, unknown>
): { id: string; node_name: string } {
  const nodeName = args.node_name as string;
  const content = args.content as string;
  const source = (args.source as string) ?? null;

  if (!nodeName) throw new Error("node_name is required");
  if (!content) throw new Error("content is required");

  const node = readNode(repoRoot, nodeName);
  if (!node) throw new Error(`Node not found: ${nodeName}`);

  const existingIds = new Set(node.observations.map((o) => o.id));
  const id = observationId(content, existingIds);

  let line = serializeObservationLine(content, id, source);
  // Zero observations means the file currently ends right after the closing
  // frontmatter delimiter (see store.ts's serializeNodeFile): the blank line
  // that normally separates frontmatter from the body is missing and must be
  // added here. A concurrent learn() landing the same blank line twice is
  // harmless: parseBody skips blank lines between bullets.
  if (node.observations.length === 0) line = "\n" + line;

  appendLineVerified(nodePath(repoRoot, nodeName), line, `id:${id}`);

  return { id, node_name: nodeName };
}
