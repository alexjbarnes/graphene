import { deleteFactFile, factsDir } from "../store.js";

export function handleProjectDelete(
  repoRoot: string,
  args: Record<string, unknown>
): { deleted: boolean } {
  const category = args.category as string;
  const subject = args.subject as string;

  if (!category || !subject) {
    throw new Error("category and subject are required");
  }

  return { deleted: deleteFactFile(factsDir(repoRoot), category, subject) };
}
