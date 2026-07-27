import { listFacts, factsDir, type StoredFact } from "../store.js";

export function handleProjectRead(
  repoRoot: string,
  args: Record<string, unknown>
): { facts: StoredFact[] } {
  const category = args.category as string | undefined;
  const subject = args.subject as string | undefined;

  let facts = listFacts(factsDir(repoRoot));
  if (category) facts = facts.filter((f) => f.category === category);
  if (subject) facts = facts.filter((f) => f.subject === subject);

  return { facts };
}
