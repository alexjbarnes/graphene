import { getChangedFiles, getHead } from "../git.js";
export function handleStatus(db, repoId, repoRoot, _args) {
    const head = getHead(repoRoot);
    const nodes = db
        .prepare("SELECT name, type, summary FROM nodes WHERE repo_id = ? ORDER BY name")
        .all(repoId);
    const allNodes = db
        .prepare("SELECT name, covers, last_commit FROM nodes WHERE repo_id = ?")
        .all(repoId);
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
    const projectFacts = db
        .prepare("SELECT * FROM project_facts WHERE repo_id = ? ORDER BY category, subject")
        .all(repoId);
    const globalFacts = db
        .prepare("SELECT * FROM facts ORDER BY category, subject")
        .all();
    const observations = db
        .prepare("SELECT node_name, content FROM observations WHERE repo_id = ? ORDER BY created_at DESC")
        .all(repoId);
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