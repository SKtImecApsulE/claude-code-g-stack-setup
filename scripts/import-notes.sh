#!/usr/bin/env bash
# Import a folder of markdown notes (e.g. an Obsidian vault) into the local GBrain.
# usage: scripts/import-notes.sh [--stop-app] <notes-folder>
#   --stop-app  stop the Brain App first (it holds the brain database) and restart it afterwards.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STOP_APP=0; NOTES=""
for a in "$@"; do
  case "$a" in
    --stop-app) STOP_APP=1 ;;
    -h|--help) sed -n '2,5p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) NOTES="$a" ;;
  esac
done

[ -n "$NOTES" ] && [ -d "$NOTES" ] || { echo "Give an existing notes folder. Try: $0 --help" >&2; exit 2; }
command -v gbrain >/dev/null || { echo "gbrain not found. Run ./scripts/setup-brain.sh first." >&2; exit 2; }

COUNT=$(find "$NOTES" -type f -name '*.md' -not -path '*/.git/*' -not -path '*/.obsidian/*' -not -path '*/.trash/*' | wc -l | tr -d ' ')
[ "$COUNT" -gt 0 ] || { echo "No .md files found in $NOTES" >&2; exit 1; }
echo "Importing $COUNT markdown files from $NOTES"

if [ "$STOP_APP" = 1 ]; then pkill -f "bun server.mjs" 2>/dev/null || true; sleep 1; fi

set +e
OUT=$(gbrain import "$NOTES" --no-embed 2>&1); RC=$?
set -e
echo "$OUT" | tail -8

if [ "$RC" -ne 0 ]; then
  if echo "$OUT" | grep -q pglite_busy; then
    echo "The brain database is held by another process (the Brain App or a Claude Code session's gbrain)." >&2
    echo "Stop it, or re-run with --stop-app to stop the Brain App automatically." >&2
  fi
  exit "$RC"
fi

if [ "$STOP_APP" = 1 ] && [ -d "$HERE/brain-app" ]; then
  (cd "$HERE/brain-app" && nohup bun server.mjs > server.log 2>&1 &)
  echo "Brain App restarted: http://127.0.0.1:3737"
fi
echo "Done. Search is keyword-only until you add an embedding key (see CLAUDE.md)."
