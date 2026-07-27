# Tools

Graphene exposes 19 MCP tools in three groups: reading, recording, and cleanup. This is the full reference. For the data model the tools operate on, see [Concepts](concepts.md). For how these tools change shape with more than one repo in scope, see [Multi-repo sessions](#multi-repo-sessions) below.

## Reading

### `status()`

Returns a bounded snapshot: current HEAD, the node index (name, type, summary, observation count), stale nodes, and project/global fact counts and keys. It never returns observation or fact bodies, so it cannot grow without bound as the graph grows. The enforcement hook injects this automatically on the first tool call of a session, so you rarely call it by hand. Call it to refresh after large changes; call `read(name)`, `project_read()`, or `global_read()` for the actual content behind a count or a key.

In a multi-repo session the shape changes to `{ repos: [...], global_facts }`: one status entry per repo (or a `{ repo, error }` entry if that repo's own status call failed), with `global_facts` reported once for the whole session rather than once per repo.

### `read(name?)`

With no argument, returns the node index: every node's name, type, and summary. This is the map.

With a `name`, returns the full node: `entry_points`, `covers`, `last_commit`, `metadata`, all observations (with their ids), outgoing edges, and incoming dependents. Each edge and dependent carries the neighbor's summary, so one `read` shows you the node and its immediate context.

In a multi-repo session, index and node results include a `repo` field, and `name` accepts `repo:name` to disambiguate.

### `search(query)`

Full-text search across nodes, observations, project facts, global facts, and edge reasons. Multi-word queries match any word and rank results by how many words hit. Returns at most the top 20 results, each with a snippet truncated to 200 characters rather than the full observation or fact body, plus an `omitted` count whenever more than 20 results matched. Use it when you do not know which node owns what you are looking for.

### `stale()`

Returns the nodes whose covered files have changed since their `last_commit`, plus a fresh count and total. A node is stale when files under its `covers` patterns changed (`reason: "changed"`) or when it has no `last_commit` at all (`reason: "untracked"`). See [Staleness](staleness.md).

### `project_read(category?, subject?, repo?)`

Reads repo-scoped facts. No arguments returns all of them. Filter by `category`, or by `category` and `subject`. `repo` is optional in a single-repo session (and must match it if given at all), required in a multi-repo one.

### `global_read(category?, subject?)`

The same, for user-level facts that span repos. Never takes a `repo`: global facts are not scoped to any repo, in any session.

## Recording

### `learn(node_name, content, source?)`

Appends an observation to a node. Append-only: it never overwrites an existing observation. The optional `source` records what triggered the learning. This is the workhorse for code knowledge, gotchas, and constraints. `node_name` accepts `repo:name` in a multi-repo session.

### `upsert_node(name, ...)`

Creates a node, or merge-updates an existing one. Pass each field as a top-level argument (`type`, `summary`, `entry_points`, `covers`, `last_commit`, `metadata`), the same shape as a node in `batch`. Do not wrap them in a `fields` object. Only the fields you pass change. `metadata` is shallow-merged rather than replaced. `type` is required when creating. The return value reports whether the node was `created` or `updated`, and which fields changed. Updating an existing node with no fields is an error rather than a silent no-op. In a multi-repo session, `name` accepts `repo:name` to target a specific repo; a bare name updates the existing node if exactly one repo has it, otherwise the owning repo is inferred from `covers`/`entry_points` paths (see [Multi-repo sessions](#multi-repo-sessions)).

### `link(from, to, type, reason)`

Creates an edge. Types: `depends_on`, `extends`, `related_to`, `mirrors`. The last two are bidirectional and create edges both ways. Idempotent: re-linking the same pair and type updates the `reason`. In a multi-repo session, `from` and `to` must resolve to the same repo.

### `batch({nodes, edges, observations})`

Creates or updates many nodes, edges, and observations in a single transaction. Pass three arrays. Each node uses the same fields as `upsert_node`. This is how `init` populates an empty graph in one shot. If any part fails, the whole transaction rolls back. In a multi-repo session, every node, edge, and observation in the batch is resolved to a repo before anything is written, and a node created earlier in the same batch is a valid target for a later edge or observation that references it by bare name.

### `project_write(category, subject, content, repo?)`

Writes a repo-scoped fact. One fact per `category` + `subject` pair; writing to an existing pair replaces the content. Use it for conventions, decisions, and context that apply across the repo and do not belong on a single node. `repo` follows the same rule as `project_read`.

### `global_write(category, subject, content)`

The same, for user-level facts that follow you across repos. Preferences, expertise, standing feedback.

### `globals_export(path)` / `globals_import(path, overwrite?)`

Move global facts between machines as a portable markdown bundle, independent of any repo. `globals_export` writes every global fact to `path` (a leading `~/` expands to the home directory). `globals_import` reads a bundle from `path` and merges it into the local global store by `category`/`subject`: a fact absent locally is written, one present with identical content is left alone, and one present with different content is skipped (and named in the response) unless `overwrite` is set, in which case it is replaced.

Both are also available from the command line, without an MCP session:

```
graphene globals export ~/graphene-globals.md
graphene globals import ~/graphene-globals.md
graphene globals import ~/graphene-globals.md --overwrite
```

A bundle is one markdown file: a header line, then one `## category / subject` section per fact.

```
# graphene globals

## preference / communication
be terse, skip the preamble

## expertise / go
assume deep Go proficiency, do not explain the basics
```

## Cleanup

### `remove_observation(node_name, id)`

Deletes one observation by id. `node_name` is the node the observation belongs to; `id` comes from a `read(name)` response. Use it when a recorded fact turns out to be wrong or outdated.

### `unlink(from, to, type?)`

Removes an edge. With a `type`, removes that specific edge. Without one, removes every edge between the two nodes.

### `delete_node(name)`

Deletes a node and, by cascade, all its edges and observations. Use it when a subsystem is removed from the codebase.

### `project_delete(category, subject, repo?)`

Removes one repo-scoped fact. `repo` follows the same rule as `project_read`.

### `global_delete(category, subject)`

Removes one user-level fact.

## Multi-repo sessions

If the working directory is itself a git repo, that repo is the only one in scope and every tool behaves exactly as described above. If it is not, but it holds one or more child repos up to two directories deep, all of them are in scope at once, aggregated into a single session.

- Every node qualifies as `repo:name`. A bare `name` still resolves for `read`, `learn`, `link`, `unlink`, `remove_observation`, `delete_node`, and `upsert_node` if it is unique across the repos in scope; if two repos both have a node by that name, the tool errors and tells you to qualify it.
- Creating a brand-new node under a bare, unqualified name routes it to whichever repo its `covers` or `entry_points` paths resolve inside. If that cannot be determined, the tool errors rather than guessing, and asks you to qualify the name or supply paths inside one repo.
- Cross-repo edges are not supported. `link`, `unlink`, and edges inside `batch` require `from` and `to` to resolve to the same repo; a pair that resolves to two different repos is rejected, naming both.
- `project_read`, `project_write`, and `project_delete` take a `repo` argument, required once more than one repo is in scope.
- `global_read`, `global_write`, `global_delete`, `globals_export`, and `globals_import` are unaffected: global facts are never scoped to a repo.
- `read()` with no name, and `status()`, aggregate across every repo in scope rather than picking one; see their entries above for the exact shape.

## A typical session

1. The hook injects `status()` on the first tool call. The agent reads the index.
2. Before touching a subsystem, the agent calls `read(name)` to load its entry points, observations, and edges.
3. The agent works, using `entry_points` to skip the search it would otherwise repeat.
4. It records what it learns with `learn()` as it goes, not after.
5. Right before commit, the pre-commit gate names the nodes the staged files touch. The agent updates each with `learn()` and a new `last_commit`, then stages the `.graphene/` changes so they land in the same commit as the code.
