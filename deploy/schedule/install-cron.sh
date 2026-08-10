#!/usr/bin/env bash
# install-cron.sh — expand curator-cadences.cron.template and install it.
# Usage: install-cron.sh -v|--vault <abs vault path> [--kit <abs kit path>] [--print]
set -euo pipefail
Usage() { echo "Usage: $0 -v|--vault <abs-vault-path> [--kit <abs-kit-path>] [--print]"; exit 2; }
VAULT="" ; PRINT=0
KIT="$(cd "$(dirname "$0")/../.." && pwd)"
while [ $# -gt 0 ]; do case "$1" in
  -v|--vault) VAULT="${2:?}"; shift;;
  --kit) KIT="${2:?}"; shift;;
  --print) PRINT=1;;
  -h|--help) Usage;;
  *) Usage;;
esac; shift; done
[ -n "$VAULT" ] || Usage
VAULT="$(cd "$VAULT" && pwd)"
TPL="$(dirname "$0")/curator-cadences.cron.template"
RENDERED="$(sed "s#{{VAULT}}#$VAULT#g; s#{{KIT}}#$KIT#g" "$TPL")"
if [ "$PRINT" = 1 ]; then printf '%s\n' "$RENDERED"; exit 0; fi
command -v copilot >/dev/null || echo "! copilot CLI not on PATH — cron lines will no-op until it is"
# merge: strip any prior vault-curator block, append the new one
( crontab -l 2>/dev/null | grep -v 'vault-curator --agent' || true; printf '%s\n' "$RENDERED" ) | crontab -
echo "✓ installed curator cadence crontab for vault $VAULT"
echo "  review: crontab -l | grep vault-curator"
