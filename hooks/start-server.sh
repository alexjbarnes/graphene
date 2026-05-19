#!/bin/sh
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}"
NATIVE="$PLUGIN_ROOT/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
if [ ! -f "$NATIVE" ]; then
  cd "$PLUGIN_ROOT" && npm install --production 2>/dev/null
fi
exec node "$PLUGIN_ROOT/dist/index.js"
