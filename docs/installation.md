# Installation

Two ways to run graphene: as a Claude Code plugin (gets you the enforcement layer), or as a standalone MCP server (just the tools).

## As a Claude Code plugin

This is the recommended path. It installs the MCP server, the hooks, the skills, and the SessionStart rules injection together.

```
/plugin marketplace add alexjbarnes/graphene
/plugin install graphene@graphene
```

The first command registers the marketplace from the GitHub repo. The second installs the `graphene` plugin from it.

The plugin ships a prebuilt `dist/`, committed to the repo, and the marketplace pins a specific commit. That combination means the plugin runs `node dist/index.js` directly with no build step and no surprise from an unpinned upstream. It is also why a version bump and a marketplace SHA update always go together: the SHA is what the install actually pulls.

Once installed, run `/graphene:init` in a repo to populate the graph. See [Skills](skills.md).

## As a standalone MCP server

Use this if you want the tools in another MCP client, or without the Claude Code enforcement layer.

```
git clone https://github.com/alexjbarnes/graphene.git
cd graphene
npm install
npm run build
```

Then register it with your MCP client. The server speaks stdio. The repo's own `.mcp.json` uses `${CLAUDE_PLUGIN_ROOT}`, which only resolves inside the plugin system, so for a standalone setup point at an absolute path:

```json
{
  "mcpServers": {
    "graphene": {
      "command": "node",
      "args": ["/absolute/path/to/graphene/dist/index.js"]
    }
  }
}
```

The server picks up the current working directory's git repo on startup. The hooks, skills, and rules injection are Claude Code features and do not come with this path. You get the 17 tools and nothing that reminds the agent to use them.

## Data locations

Graphene writes to two places:

- **Per repo**: `<repo>/.graphene/context.db` holds that repo's nodes, edges, observations, and project facts.
- **Per user**: `~/.graphene/global.db` holds cross-repo facts. `~/.graphene/sessions/` holds the hook's per-session state files.

The database is SQLite, run in-process through `sql.js` (SQLite compiled to WebAssembly). The whole database lives in memory while the server runs and is flushed to disk on every write that is not inside a transaction, and once at the end of a transaction. There is no separate database process.

## Is the graph committed?

By default, no. The repo's `.gitignore` excludes `.graphene/` and `*.db`, so the graph stays local to each clone. Each developer or agent builds and maintains their own.

To share one graph across a team, remove `.graphene/` from `.gitignore` and commit `context.db`. Weigh it before you do: a shared graph means shared, current context for everyone, but the binary SQLite file produces opaque diffs and merge conflicts that git cannot resolve cleanly. Most setups are better off with each clone running `/graphene:init` once.

## Configuration

Graphene has no environment variables of its own. The only external input is `CLAUDE_PLUGIN_ROOT`, which Claude Code sets for the plugin so the hooks can find the compiled `dist/`. Paths to the databases are derived from the repo root and the home directory, not configured.

## Development

```
npm install
npm run build    # tsc, emits dist/
npm test         # vitest run
npm run test:watch
```

`dist/` is committed, so rebuild and commit it alongside source changes. The plugin and the hooks both run the compiled output, not the TypeScript.
