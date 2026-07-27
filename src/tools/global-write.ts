import { writeFact } from "../store.js";

export function handleGlobalWrite(
  globalDirPath: string,
  args: Record<string, unknown>
): { category: string; subject: string } {
  const category = args.category as string;
  const subject = args.subject as string;
  const content = args.content as string;

  if (!category || !subject || !content) {
    throw new Error("category, subject, and content are required");
  }

  writeFact(globalDirPath, { category, subject, content });

  return { category, subject };
}
