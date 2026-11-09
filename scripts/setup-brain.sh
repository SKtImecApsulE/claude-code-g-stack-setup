#!/usr/bin/env bash
# Rebuilds the GBrain (https://github.com/garrytan/gbrain) memory on any machine or fresh cloud session.
# Keyless local PGLite brain, registered as a user-scope Claude Code MCP server. Idempotent.
set -euo pipefail

GSTACK="$HOME/.claude/skills/gstack"
if [ ! -d "$GSTACK/bin" ]; then
  git clone --depth 1 https://github.com/garrytan/gstack.git "$GSTACK"
  (cd "$GSTACK" && ./setup --team)
fi

"$GSTACK/bin/gstack-gbrain-install"            # installs gbrain CLI (skips if present)
[ -f "$HOME/.gbrain/config.json" ] || gbrain init --pglite --json
gbrain apply-migrations --yes --no-autopilot-install || true

if command -v claude >/dev/null; then
  claude mcp remove gbrain -s user 2>/dev/null || true
  claude mcp add --scope user gbrain -- "$(command -v gbrain)" serve
fi

REMOTE="$(git remote get-url origin 2>/dev/null || true)"
[ -n "$REMOTE" ] && "$GSTACK/bin/gstack-gbrain-repo-policy" set "$REMOTE" read-write && gbrain import "$(pwd)" --no-embed
gbrain doctor --json >/dev/null && echo "gbrain ready. Restart Claude Code to load mcp__gbrain__* tools."
