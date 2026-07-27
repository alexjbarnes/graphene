import { deleteFactFile } from "../store.js";
export function handleGlobalDelete(globalDirPath, args) {
    const category = args.category;
    const subject = args.subject;
    if (!category || !subject) {
        throw new Error("category and subject are required");
    }
    return { deleted: deleteFactFile(globalDirPath, category, subject) };
}
//# sourceMappingURL=global-delete.js.map