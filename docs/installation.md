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

The server picks up the current working directory's git repo on startup. The hooks, skills, and rules injection are Claude Code features and do not come with this path. You get the 19 tools and nothing that reminds the agent to use them.

## Data locations

- **Per repo**: `<repo>/.graphene/nodes/` holds one markdown file per node. `<repo>/.graphene/facts/` holds one markdown file per project fact.
- **Per user**: `~/.graphene/global/` holds one markdown file per global fact. `~/.graphene/sessions/` holds the hook's per-session state files.

Every file is plain markdown, written atomically (a temp file, then a rename onto the real path) so a crash mid-write never leaves a half-written file behind. There is no database and no separate server process: every tool call reads or writes the files it needs directly. See [Concepts](concepts.md) for what a node or fact file actually looks like.

## Is the graph committed?

Yes. `.graphene/nodes/` and `.graphene/facts/` are ordinary files with nothing graphene-specific excluding them from git: commit `.graphene/` like the rest of the repo, and everyone who clones it gets the graph as of that commit. The enforcement layer assumes this. The commit gate (see [Enforcement](enforcement.md)) exists specifically to get `.graphene/` changes into the same commit as the code they describe, not a separate one.

If you are adopting graphene on a repo where more than one person already built their own graph independently, the first shared sync looks like an ordinary merge: expect a text conflict on any node or fact file two of you both touched, and resolve it the way you would any other merge conflict. There is no binary format to fight with, because there is no binary file. If your team edits the same nodes often enough that this comes up a lot, add a `.gitattributes` line so git can merge concurrent observation appends on its own instead of flagging every one as a conflict:

```
.graphene/nodes/*.md merge=union
```

That tells git to keep both sides' added lines when a node file changes on both branches of a merge, which is what an append-only observation list wants. It is not a substitute for review, since `union` can still interleave two edits into a strange order, so skim a merged node file after a `union` merge goes through.

## Migration from the SQLite era

Versions before v0.11 stored the graph in SQLite: `.graphene/context.db` per repo, `~/.graphene/global.db` for global facts. From v0.11 on, graphene stores the markdown files described above, and migrates a legacy database automatically the first time it finds one.

On startup, for every repo in scope and for the global store, graphene checks for a legacy `.db` file. If one exists:

- Every node, edge, observation, and fact is read out of it and written as the equivalent markdown file.
- A legacy name that was not a valid slug (uppercase, spaces, `:`, `/`, a leading `.` or `-`, `__`) is normalized, and the affected node gets a new observation recording the rename, so the history is not lost silently.
- The database is renamed to the same path with `.migrated` appended (`context.db` -> `context.db.migrated`, `global.db` -> `global.db.migrated`), never deleted.
- For a repo migration, if that repo's `.gitignore` has an exact `.graphene/` or `.graphene` line, it is rewritten to `.graphene/*.migrated`, so the new markdown graph is no longer excluded but the retired database stays out.

Migrating needs Node.js >= 22.5, because it reads the legacy database through the experimental `node:sqlite` module. Everyday use of graphene does not need it: the check only matters when a legacy `.db` file is actually present. If one is present and the Node version is too old, graphene logs which file needs migration and skips it, retrying on the next start once you are on a new enough Node.

`graphene globals export` and `graphene globals import` (see [Tools](tools.md)) run the global migration first too, so the CLI always reads and writes the current markdown format even in a session that never triggered it on its own.

## Configuration

Graphene has no environment variables of its own. The only external input is `CLAUDE_PLUGIN_ROOT`, which Claude Code sets for the plugin so the hooks can find the compiled `dist/`. Paths to the graph and fact files are derived from the repo root and the home directory, not configured.

## Development

```
npm install
npm run build    # tsc, emits dist/
npm test         # vitest run
npm run test:watch
```

`dist/` is committed, so rebuild and commit it alongside source changes. The plugin and the hooks both run the compiled output, not the TypeScript.
