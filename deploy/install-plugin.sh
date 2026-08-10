#!/usr/bin/env bash
# install-plugin.sh — wire the vault-curator plugin + vault-mcp server for a vault.
# Writes an ABSOLUTE-path .mcp.json (Copilot CLI does NOT expand ${VAR:-default};
# findings #6/#7) into the vault's Copilot config, and registers the plugin.
#
# Usage:
#   deploy/install-plugin.sh -v|--vault <vault-dir> [-c|--clearance <level>] [--dev]
set -euo pipefail
Usage() {
  cat <<EOF
Usage: $0 -v|--vault <vault-dir> [options]
  -v, --vault <dir>       target vault path (required)
  -c, --clearance <lvl>   public|internal|confidential|restricted (default internal)
      --dev               copilot plugin install ./vault-curator (local dev install)
  -h, --help              this text
EOF
  exit 2
}
VAULT="" ; CLEAR="internal" ; DEV=0
while [ $# -gt 0 ]; do case "$1" in
  -v|--vault) VAULT="${2:?}"; shift;;
  -c|--clearance) CLEAR="${2:?}"; shift;;
  --dev) DEV=1;;
  -h|--help) Usage;;
  *) echo "unknown arg: $1"; Usage;;
esac; shift; done
[ -n "$VAULT" ] || Usage
case "$CLEAR" in public|internal|confidential|restricted) ;; *) echo "bad clearance: $CLEAR"; exit 2;; esac
KIT="$(cd "$(dirname "$0")/.." && pwd)"
VAULT="$(cd "$VAULT" && pwd)"

BUNDLE="$KIT/vault-mcp/bin/vault-mcp.mjs"
GATE="$KIT/vault-curator/gate-server/index.js"
[ -f "$BUNDLE" ] || { echo "missing $BUNDLE — run: (cd vault-mcp && npm run build)"; exit 1; }
[ -f "$GATE" ] || { echo "missing $GATE"; exit 1; }
command -v node >/dev/null || { echo "node not found on PATH"; exit 1; }
NODE="$(command -v node)"

# --- absolute-path .mcp.json (NO ${VAR} — CLI passes those literally) ---
mkdir -p "$VAULT/.github"
cat > "$VAULT/.mcp.json" <<EOF
{
  "mcpServers": {
    "vault-read": {
      "type": "local",
      "command": "$NODE",
      "args": ["$BUNDLE", "--vault", "$VAULT", "--clearance", "$CLEAR"],
      "tools": ["*"]
    },
    "curator-gate": {
      "type": "local",
      "command": "$NODE",
      "args": ["$GATE", "--vault", "$VAULT"],
      "tools": ["curator_propose", "curator_status", "curator_report", "curator_invoke"]
    }
  }
}
EOF
echo "→ wrote $VAULT/.mcp.json (absolute paths, clearance=$CLEAR)"

# --- plugin registration ---
if [ "$DEV" = 1 ]; then
  if command -v copilot >/dev/null; then
    copilot plugin install "$KIT/vault-curator" && echo "→ dev-installed vault-curator"
  else
    echo "! copilot CLI not found — skipped dev install; repo-level .github/hooks/ fence still active"
  fi
else
  echo "→ enterprise/marketplace path: register $KIT/marketplace.json, then:"
  echo "    copilot plugin marketplace add $KIT"
  echo "    copilot plugin install vault-curator@fi-knowledge-plugins"
fi

echo "✓ wired. The repo-level .github/hooks/ fence is active regardless of plugin-hook firing (copilot-cli#2540)."
echo "  Verify: cd into the vault, start a Copilot session, attempt an edit under 10-notes/ — must be denied."
