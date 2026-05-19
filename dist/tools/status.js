import { getChangedFiles, getHead } from "../git.js";
export function handleStatus(repoDB, globalDB, repoRoot, _args) {
    const head = getHead(repoRoot);
    const nodes = repoDB
        .prepare("SELECT name, type, summary FROM nodes ORDER BY name")
        .all();
    const allNodes = repoDB
        .prepare("SELECT name, covers, last_commit FROM nodes")
        .all();
    const staleNodes = [];
    for (const node of allNodes) {
        const covers = JSON.parse(node.covers || "[]");
        if (!node.last_commit) {
            staleNodes.push({ name: node.name, reason: "untracked", changed_files: [] });
            continue;
        }
        if (covers.length === 0)
            continue;
        const changed = getChangedFiles(repoRoot, node.last_commit, covers);
        if (changed.length > 0) {
            staleNodes.push({ name: node.name, reason: "changed", changed_files: changed });
        }
    }
    const projectFacts = repoDB
        .prepare("SELECT * FROM project_facts ORDER BY category, subject")
        .all();
    const globalFacts = globalDB
        .prepare("SELECT * FROM facts ORDER BY category, subject")
        .all();
    const observations = repoDB
        .prepare("SELECT node_name, content FROM observations ORDER BY created_at DESC")
        .all();
    const observationsByNode = {};
    for (const obs of observations) {
        if (!observationsByNode[obs.node_name])
            observationsByNode[obs.node_name] = [];
        if (observationsByNode[obs.node_name].length < 3) {
            observationsByNode[obs.node_name].push(obs.content);
        }
    }
    return {
        head,
        nodes,
        stale_nodes: staleNodes,
        project_facts: projectFacts,
        global_facts: globalFacts,
        observations_by_node: observationsByNode,
    };
}
//# sourceMappingURL=status.js.map