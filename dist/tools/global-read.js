import { listFacts } from "../store.js";
export function handleGlobalRead(globalDirPath, args) {
    const category = args.category;
    const subject = args.subject;
    let facts = listFacts(globalDirPath);
    if (category)
        facts = facts.filter((f) => f.category === category);
    if (subject)
        facts = facts.filter((f) => f.subject === subject);
    return { facts };
}
//# sourceMappingURL=global-read.js.map