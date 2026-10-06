---
name: init
description: Populate the graphene context graph for a new repo. Use when the graph is empty or when starting fresh.
---

# Initialize Graphene Context Graph

## Process

1. Map the top-level directory structure:

!`find . -maxdepth 2 -type f -name '*.ts' -o -name '*.js' -o -name '*.py' -o -name '*.go' -o -name '*.rs' | head -80`

2. Identify 5-15 logical subsystems. A subsystem is a group of files that serve one purpose (auth, database, API routing, tests, deployment). Name them as slugs.

3. For each subsystem, determine:
   - `summary`: one sentence describing its purpose
   - `covers`: directory or file glob patterns (e.g. `["src/auth/", "src/middleware/auth*"]`)
   - `entry_points`: the 1-3 most important files to read first
   - `type`: subsystem, module, library, or config

4. Get the current HEAD commit for last_commit:

!`git rev-parse HEAD 2>/dev/null`

5. Create all nodes in a single `batch()` call. Example structure:

```json
{
  "nodes": [
    {
      "name": "auth",
      "type": "subsystem",
      "summary": "JWT authentication and session management",
      "covers": ["src/auth/"],
      "entry_points": ["src/auth/router.ts", "src/auth/middleware.ts"],
      "last_commit": "<HEAD>"
    }
  ],
  "edges": [
    {
      "from": "auth",
      "to": "database",
      "type": "depends_on",
      "reason": "stores sessions and credentials"
    }
  ]
}
```

6. After creating nodes, add observations for anything non-obvious you noticed during exploration. Use `learn(node_name, content)` for each. Keep each to one point in a few sentences, at most 1,500 characters. A node holds at most 20,000 characters of observations.

7. Run `/graphene:migrate-memory` to move this project's existing auto-memory into the graph.

8. Stage and commit `.graphene/`. The graph lives in this repo, under `.graphene/`, and is committed with the code, not gitignored. Once the graph is populated, `git add .graphene` and commit it, so the next clone gets the graph too.

## Guidelines

- Prefer fewer complete nodes over many thin ones. 5 well-documented subsystems beat 20 stubs.
- Nodes should be answer-shaped: "where does permission handling happen end to end?" not just "here are the permission files."
- Record cross-cutting concerns as edges, not as separate nodes.
- Set `covers` patterns broad enough to catch related files but narrow enough to avoid false staleness.
- Every node must have summary, covers, entry_points, and last_commit. Skip a node rather than create an incomplete one.
