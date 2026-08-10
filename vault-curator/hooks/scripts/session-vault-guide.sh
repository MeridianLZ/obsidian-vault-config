#!/usr/bin/env bash
# sessionStart: inject the vault guide + board summary so primaries start schema-aware.
# Emits additionalContext JSON on stdout. Non-fatal on any failure (guide is a courtesy;
# the fence is the guarantee).
#
# Usage: session-vault-guide.sh   (invoked by Copilot CLI hooks runtime; no args)
set -uo pipefail
Usage() { echo "Usage: invoked as a Copilot CLI sessionStart hook; reads JSON on stdin"; exit 0; }
[ $# -gt 0 ] && Usage

INPUT="$(cat)"
CWD="$(node -e 'try{console.log(JSON.parse(process.argv[1]).cwd||"")}catch{console.log("")}' "$INPUT" 2>/dev/null)"
VAULT="${VAULT_PATH:-$CWD}"

SUMMARY=""
CONSTITUTION="$VAULT/00-system/schema/00-vault-initial-state.md"
[ -f "$CONSTITUTION" ] || CONSTITUTION="$VAULT/00-vault-initial-state.md"
if [ -f "$CONSTITUTION" ]; then
  SUMMARY="VAULT SESSION CONTEXT (vault-curator plugin)
- Schema constitution: ${CONSTITUTION#"$VAULT"/} — read it before proposing any mutation.
- ALL mutations to 10-notes/ 20-tasks/ 40-sources/ 50-entities/ 90-archive/ 00-system/ go through the Curator gate: curator_propose (MCP) or /agent curator. Direct edits are hook-denied.
- Free-write zones: 01-inbox/ (capture) and today's daily note only.
- Retrieval: call get_vault_guide once, then route by the angle→question map (vault-retrieval skill).
- Never rewrite git history; never touch 00-system/audit/."
  BOARD_COUNT="$(grep -rl '^status: \(doing\|blocked\)' "$VAULT/20-tasks" 2>/dev/null | wc -l | tr -d ' ')"
  SUMMARY="$SUMMARY
- Board: ${BOARD_COUNT:-0} card(s) in doing/blocked (use the board tool for detail)."
fi

node -e 'console.log(JSON.stringify({ additionalContext: process.argv[1] }))' "$SUMMARY" 2>/dev/null || echo '{}'
exit 0
