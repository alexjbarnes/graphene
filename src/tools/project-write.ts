import { writeFact, factsDir } from "../store.js";

export function handleProjectWrite(
  repoRoot: string,
  args: Record<string, unknown>
): { category: string; subject: string } {
  const category = args.category as string;
  const subject = args.subject as string;
  const content = args.content as string;

  if (!category || !subject || !content) {
    throw new Error("category, subject, and content are required");
  }

  writeFact(factsDir(repoRoot), { category, subject, content });

  return { category, subject };
}
