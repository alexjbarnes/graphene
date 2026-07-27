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

Graphene keeps everything in one SQLite file:

- **`~/.graphene/graphene.db`**: every repo's nodes, edges, observations, and project facts, plus your cross-repo global facts. Each repo is a row in a `repos` table, and repo-scoped data carries that repo's id. Global facts carry no repo.
- **`~/.graphene/sessions/`**: the hook's per-session state files.

The engine is `better-sqlite3` (native SQLite, run in-process). It reads and writes the file directly under WAL, so concurrent sessions see each other's committed writes rather than a snapshot frozen at startup. There is no separate database process.

Earlier versions kept one file per repo at `<repo>/.graphene/context.db` and a separate `~/.graphene/global.db`. On first run the server imports each legacy file into `graphene.db` and renames the original to `.migrated`. The import runs once and loses nothing.

## Is the graph committed?

No. The graph lives under your home directory, not in the repo, so it is never staged, committed, or shown in a diff. Each developer or agent builds and maintains their own.

## Configuration

Graphene has no environment variables of its own. The only external input is `CLAUDE_PLUGIN_ROOT`, which Claude Code sets for the plugin so the hooks can find the compiled `dist/`. The database path is derived from the home directory; each repo is identified inside the file by its root path, not configured.

## Development

```
npm install
npm run build    # tsc, emits dist/
npm test         # vitest run
npm run test:watch
```

`dist/` is committed, so rebuild and commit it alongside source changes. The plugin and the hooks both run the compiled output, not the TypeScript.
