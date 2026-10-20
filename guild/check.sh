#!/usr/bin/env bash
# Validate, type-check and test the guild mod. Run from anywhere: bash check.sh
set -uo pipefail
status=0
MOD="$(cd "$(dirname "$0")" && pwd)"

# The `claude` on PATH can lag behind the desktop app's build; prefer the newest bundled one.
CLAUDE="$(ls -d "$APPDATA"/Claude/claude-code/*/*/claude.exe 2>/dev/null | sort -V | tail -1 || true)"
CLAUDE="${CLAUDE:-claude}"

echo "== validate ($("$CLAUDE" --version))"
"$CLAUDE" plugin validate "$MOD" | tail -1
echo "== typecheck ($(tsc -v))"
if tsc -p "$MOD"; then echo "types OK"; else echo "TYPES FAILED"; status=1; fi
echo "== test"
"$CLAUDE" plugin test "$MOD" | tail -3 || status=1
exit $status
