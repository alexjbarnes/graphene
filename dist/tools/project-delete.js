import { deleteFactFile, factsDir } from "../store.js";
export function handleProjectDelete(repoRoot, args) {
    const category = args.category;
    const subject = args.subject;
    if (!category || !subject) {
        throw new Error("category and subject are required");
    }
    return { deleted: deleteFactFile(factsDir(repoRoot), category, subject) };
}
//# sourceMappingURL=project-delete.js.map