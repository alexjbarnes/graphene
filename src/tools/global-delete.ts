import { deleteFactFile } from "../store.js";

export function handleGlobalDelete(
  globalDirPath: string,
  args: Record<string, unknown>
): { deleted: boolean } {
  const category = args.category as string;
  const subject = args.subject as string;

  if (!category || !subject) {
    throw new Error("category and subject are required");
  }

  return { deleted: deleteFactFile(globalDirPath, category, subject) };
}
