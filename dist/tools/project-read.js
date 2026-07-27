import { listFacts, factsDir } from "../store.js";
export function handleProjectRead(repoRoot, args) {
    const category = args.category;
    const subject = args.subject;
    let facts = listFacts(factsDir(repoRoot));
    if (category)
        facts = facts.filter((f) => f.category === category);
    if (subject)
        facts = facts.filter((f) => f.subject === subject);
    return { facts };
}
//# sourceMappingURL=project-read.js.map