import { listNodes, readNode, listFacts, factsDir } from "../store.js";
const MAX_RESULTS = 20;
const SNIPPET_LIMIT = 200;
// Text kept ahead of the hit a snippet is placed on, so the match reads in
// context rather than opening the snippet cold.
const SNIPPET_LEAD = 60;
function scoreMatch(text, words) {
    const lower = text.toLowerCase();
    return words.filter((w) => lower.includes(w.toLowerCase())).length;
}
// A SNIPPET_LIMIT window placed over the match, not the opening of the text:
// observations run to thousands of characters, and the hit is often far past
// the first 200. Every hit of every query word is a candidate window; the one
// holding the most distinct query words wins, earliest on ties. Text with no
// hit in it (a node matched on its name, say) falls back to the opening.
function matchSnippet(text, words) {
    if (text.length <= SNIPPET_LIMIT)
        return text;
    const lower = text.toLowerCase();
    const needles = words.map((w) => w.toLowerCase());
    let bestStart = 0;
    let bestScore = 0;
    for (const needle of needles) {
        for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + needle.length)) {
            const start = Math.max(0, Math.min(at - SNIPPET_LEAD, text.length - SNIPPET_LIMIT));
            const window = lower.slice(start, start + SNIPPET_LIMIT);
            const score = needles.filter((n) => window.includes(n)).length;
            if (score > bestScore || (score === bestScore && start < bestStart)) {
                bestScore = score;
                bestStart = start;
            }
        }
    }
    const end = bestStart + SNIPPET_LIMIT;
    return `${bestStart > 0 ? "..." : ""}${text.slice(bestStart, end)}${end < text.length ? "..." : ""}`;
}
export function handleSearch(repoRoot, globalDirPath, args) {
    const query = args.query;
    if (!query)
        throw new Error("query is required");
    const words = query.split(/\s+/).filter(Boolean);
    if (words.length === 0)
        throw new Error("query is required");
    const nodes = listNodes(repoRoot)
        .map((name) => readNode(repoRoot, name))
        .filter((n) => n !== null);
    const results = [];
    for (const node of nodes) {
        const score = scoreMatch(`${node.name} ${node.summary ?? ""}`, words);
        if (score > 0) {
            results.push({
                type: "node",
                node_name: node.name,
                snippet: matchSnippet(node.summary ?? node.name, words),
                score,
            });
        }
    }
    // Observation results carry the id so read(node_name, id) can fetch the
    // full text behind the snippet without reading the whole node.
    for (const node of nodes) {
        for (const obs of node.observations) {
            const score = scoreMatch(obs.content, words);
            if (score > 0) {
                results.push({
                    type: "observation",
                    node_name: node.name,
                    id: obs.id,
                    snippet: matchSnippet(obs.content, words),
                    score,
                });
            }
        }
    }
    for (const fact of listFacts(factsDir(repoRoot))) {
        const score = scoreMatch(`${fact.category} ${fact.subject} ${fact.content}`, words);
        if (score > 0) {
            results.push({
                type: "project_fact",
                node_name: `${fact.category}/${fact.subject}`,
                snippet: matchSnippet(fact.content, words),
                score,
            });
        }
    }
    for (const fact of listFacts(globalDirPath)) {
        const score = scoreMatch(`${fact.category} ${fact.subject} ${fact.content}`, words);
        if (score > 0) {
            results.push({
                type: "global_fact",
                node_name: `${fact.category}/${fact.subject}`,
                snippet: matchSnippet(fact.content, words),
                score,
            });
        }
    }
    for (const node of nodes) {
        for (const edge of node.edges) {
            if (edge.reason === null)
                continue;
            const score = scoreMatch(edge.reason, words);
            if (score > 0) {
                results.push({
                    type: "edge",
                    node_name: `${node.name} -> ${edge.to}`,
                    snippet: matchSnippet(`[${edge.type}] ${edge.reason}`, words),
                    score,
                });
            }
        }
    }
    results.sort((a, b) => b.score - a.score);
    const omitted = results.length - MAX_RESULTS;
    const bounded = results.slice(0, MAX_RESULTS);
    return omitted > 0 ? { results: bounded, omitted } : { results: bounded };
}
//# sourceMappingURL=search.js.map