---
category: constraint
subject: plugin-no-path-binary
---

Plugin installs expose NO binary on PATH. package.json declares "bin": {"graphene": "dist/index.js"}, but bin linking only happens on npm install of the package itself; the Claude Code plugin cache (~/.claude/plugins/cache/...) is a plain directory, npm-installed in place, never linked. Verified 2026-07-09. Implication: any feature shaped as "the user types `graphene <subcommand>`" is unreachable for plugin users (i.e. all current users). CLI features must also surface as MCP tools, or as skills invoking node $CLAUDE_PLUGIN_ROOT/dist/index.js. Drove the v0.11 decision to ship globals export/import as MCP tools (globals_export/globals_import) with CLI subcommands only as an npm-install extra.
