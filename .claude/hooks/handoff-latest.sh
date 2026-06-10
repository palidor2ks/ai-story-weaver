#!/usr/bin/env bash
# SessionStart hook: print the most-recent (top) entry of docs/HANDOFF.md into context,
# so "where we left off" lands automatically even if the reader forgets to look.
# Prints ONLY the latest entry (not the whole file). Fails gracefully (prints nothing)
# if the file or a dated entry is missing. Always exits 0 so it never blocks a session.
set +e

HANDOFF="docs/HANDOFF.md"
[ -f "$HANDOFF" ] || exit 0

# Entry headings look like: "## 2026-06-08 — <branch>". The template heading
# ("## Entry template") is intentionally NOT matched, so it is skipped.
# Print from the first dated heading until just before the next dated heading (or EOF).
entry="$(awk '
  /^## [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/ {
    if (found) exit
    found = 1
  }
  found { print }
' "$HANDOFF")"

if [ -n "$entry" ]; then
  echo "[handoff] Most recent docs/HANDOFF.md entry — where we left off:"
  echo "$entry"
fi

exit 0
