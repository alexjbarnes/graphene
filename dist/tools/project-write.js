import { writeFact, factsDir } from "../store.js";
export function handleProjectWrite(repoRoot, args) {
    const category = args.category;
    const subject = args.subject;
    const content = args.content;
    if (!category || !subject || !content) {
        throw new Error("category, subject, and content are required");
    }
    writeFact(factsDir(repoRoot), { category, subject, content });
    return { category, subject };
}
//# sourceMappingURL=project-write.js.map