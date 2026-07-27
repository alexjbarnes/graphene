# Concepts

Graphene stores five kinds of thing: nodes, edges, observations, project facts, and global facts. The first three describe the codebase. The last two hold knowledge that does not belong to any single part of it.

## Nodes

A node is a subsystem: a group of files that serve one purpose. Auth, the database layer, the API router, the test harness. A node is the answer to "where does X happen, end to end," not a single file.

Each node has:

- **name**: a slug, unique per repo. The primary key.
- **type**: `subsystem`, `module`, `library`, `config`, or whatever label fits. Required when you create the node.
- **summary**: one sentence on what the subsystem is for.
- **entry_points**: the one to three files an agent should open first to understand it.
- **covers**: directory and file patterns the node owns, like `["src/auth/", "src/middleware/auth"]`. This is what staleness detection compares against git changes. See [Staleness](staleness.md).
- **last_commit**: the commit the node was last verified against. Drives staleness.
- **metadata**: freeform structured data (invariants, interface shapes, anything that does not fit the fields above). Shallow-merged on update.

Aim for fewer complete nodes over many thin ones. Five well-documented subsystems beat twenty stubs. A node with no summary, no `entry_points`, and no `covers` is worse than no node, because it claims coverage it does not provide.

## Edges

An edge is a directed relationship between two nodes. It carries a `type` and a `reason`.

- **depends_on**: the source needs the target to function.
- **extends**: the source builds on or specializes the target.
- **related_to**: a looser association. Bidirectional.
- **mirrors**: the two nodes share a structure or pattern. Bidirectional.

The bidirectional types (`related_to`, `mirrors`) create edges in both directions automatically. Linking is idempotent: re-linking the same pair and type updates the `reason` rather than creating a duplicate.

The `reason` matters as much as the edge. "auth depends_on database" is thin. "auth depends_on database: stores sessions and credential hashes" tells the next agent what breaks if the database contract changes.

Record cross-cutting concerns as edges, not as separate nodes. A logging concern that touches every subsystem is a set of edges, not a `logging` node that duplicates the others.

## Observations

An observation is a single learned fact attached to a node. Observations are append-only. Writing one never overwrites another.

Use them for the things you only learn by reading the code: a non-obvious constraint, a workaround, a gotcha, the reason a function looks wrong but is not. When `read(name)` returns a node, its observations come with it, so the next session inherits the discovery without re-deriving it.

When an observation turns out to be wrong, remove it by id with `remove_observation`. Do not leave a false note for a future session to trust.

## Project facts

A project fact is repo-scoped knowledge that does not belong to a node. Conventions, decisions, preferences that apply across the whole codebase.

A fact is keyed by `category` plus `subject`, and that pair is unique. Writing to an existing pair replaces the content. Examples:

- `convention` / `builds`: "NODE_ENV must not be set when building, it breaks the bundler"
- `preference` / `tests`: "no mocks in unit tests, use the in-memory database helper"
- `decision` / `auth`: "we chose session cookies over JWT, see the ADR in docs/"

Project facts are stored alongside the nodes, scoped to the repo by `repo_id`.

## Global facts

A global fact is the same shape as a project fact, but it carries no repo scope and applies across every repo. It lives in the same `~/.graphene/graphene.db` file as everything else. Use it for things about you, the user, that do not change per project:

- `preference` / `communication`: "be terse, skip the preamble"
- `expertise` / `go`: "assume deep Go proficiency, do not explain the basics"
- `feedback` / `refactors`: "prefer one PR per refactor, not a chain"

The split matters. A convention about one repo's build is a project fact. A standing preference about how you like to work is a global fact. When the scope is genuinely unclear, the agent should ask rather than guess.

## Why two databases

Repo knowledge is portable with the repo and shared with anyone who clones it (though the graph file itself is gitignored by default, see [Installation](installation.md)). User knowledge follows you across every project on your machine. Keeping them in separate files keeps the boundary clean: nothing about your personal preferences leaks into a repo's graph, and nothing repo-specific pollutes your global one.
