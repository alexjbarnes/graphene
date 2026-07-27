import { writeFact } from "../store.js";
export function handleGlobalWrite(globalDirPath, args) {
    const category = args.category;
    const subject = args.subject;
    const content = args.content;
    if (!category || !subject || !content) {
        throw new Error("category, subject, and content are required");
    }
    writeFact(globalDirPath, { category, subject, content });
    return { category, subject };
}
//# sourceMappingURL=global-write.js.map