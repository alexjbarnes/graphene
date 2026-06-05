# Graphene

<p align="center">A persistent context graph for AI coding agents.</p>

## Why

An AI agent starts every session blind. It re-reads the same files, re-derives the same architecture, and rediscovers the same constraints you watched it learn yesterday. When the session ends, the context dies with it.

Graphene gives the agent a memory that survives. It stores a graph of your codebase: subsystems as nodes, the relationships between them as edges, and the observations an agent records while working. The next session reads the graph instead of starting from zero.

The hard part of agent memory is not storage. It is discipline. Agents forget to read what earlier sessions saved, and forget to record what they just learned. Graphene ships behavioral enforcement to close that gap: a hook injects the graph at session start, a commit gate flags the nodes a change touched, and an auto-injected `CLAUDE.md` keeps the rules in front of the agent.

Three things follow:

1. **Sessions compound.** What one session learns, the next one reads. The graph is the shared notebook every session writes back to.
2. **Less wasted exploration.** Each node carries `entry_points` and observations, so the agent jumps straight to the files that matter instead of grepping its way back to them.
3. **Recording happens, instead of being hoped for.** The enforcement layer turns "you should update the graph" into a prompt the agent sees at the moments that matter: first tool call, and every commit.

The graph lives in your repo at `.graphene/context.db`. User-level preferences that span repos live in `~/.graphene/global.db`.

## Quick start

Install as a Claude Code plugin:

```
/plugin marketplace add alexjbarnes/graphene
/plugin install graphene@graphene
```

This wires up the MCP server, the enforcement hooks, the `init` and `refresh` skills, and the `CLAUDE.md` block in one step. The plugin ships a prebuilt `dist/`, so there is no build step on your machine.

Then, in any repo:

```
/graphene:init
```

The agent explores the codebase and populates the graph. From that point on, every session starts with the graph in context.

See [Installation](docs/installation.md) for the standalone MCP setup and data locations.

## Prerequisites

- Node.js >= 20.11 (the hooks use `import.meta.dirname`)
- [Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-code) for the enforcement layer. The MCP server alone works with any MCP client, but the hooks, skills, and `CLAUDE.md` injection are Claude Code features.
- `git`. Staleness detection and the commit gate read the repo's git history.

## How it works

Graphene is two layers.

The **MCP server** stores and serves the graph. It exposes 17 tools across reading (`status`, `read`, `search`, `stale`), recording (`learn`, `upsert_node`, `link`, `batch`, `project_write`, `global_write`), and cleanup. Data sits in SQLite, run in-process through `sql.js`. See [Tools](docs/tools.md) and [Concepts](docs/concepts.md).

The **enforcement layer** is a set of Claude Code hooks. On the first tool call of a session, a `PreToolUse` hook injects the current graph. After every `git commit`, a `PostToolUse` hook lists the nodes whose covered files changed and tells the agent to update them. See [Enforcement](docs/enforcement.md).

## Documentation

- [Concepts](docs/concepts.md): nodes, edges, observations, project and global facts, and how scope is decided
- [Tools](docs/tools.md): the full reference for all 17 MCP tools
- [Enforcement](docs/enforcement.md): the hook layer, status injection, the commit gate, session state, and the auto-injected `CLAUDE.md`
- [Staleness](docs/staleness.md): how `covers` and `last_commit` let the graph detect its own drift
- [Skills](docs/skills.md): the `init` and `refresh` slash commands
- [Installation](docs/installation.md): plugin install, standalone MCP setup, data locations, and configuration

## Development

```
npm install
npm run build
npm test
```

Tests run on [Vitest](https://vitest.dev/). The suite covers the database wrapper, every tool, the git helpers, and the hook logic.

## License

MIT
