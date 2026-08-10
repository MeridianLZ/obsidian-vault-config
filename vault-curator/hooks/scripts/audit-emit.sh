#!/usr/bin/env bash
# postToolUse: mirror every accepted write into a session-side JSONL
# (who/what/when/hash) — belt to the audit log's suspenders, reconciled at daily drain.
#
# Usage: audit-emit.sh   (invoked by Copilot CLI hooks runtime; no args)
set -uo pipefail
Usage() { echo "Usage: invoked as a Copilot CLI postToolUse hook; reads JSON on stdin"; exit 0; }
[ $# -gt 0 ] && Usage

INPUT="$(cat)"
DATA_DIR="${COPILOT_PLUGIN_DATA:-${HOME}/.copilot/plugin-data/vault-curator}"
mkdir -p "$DATA_DIR" 2>/dev/null || exit 0

node -e '
const fs = require("fs"), crypto = require("crypto"), path = require("path");
const input = JSON.parse(process.argv[1] || "{}");
const dataDir = process.argv[2];
const args = input.toolArgs || {};
const target = String(args.path ?? args.file_path ?? args.filePath ?? "");
if (!target) process.exit(0);
let hash = null;
try { hash = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex"); } catch {}
const line = JSON.stringify({
  ts: new Date().toISOString(),
  session: input.sessionId ?? null,
  tool: input.toolName,
  path: target,
  sha256: hash,
  result: input.toolResult?.resultType ?? null,
});
fs.appendFileSync(path.join(dataDir, "write-audit.jsonl"), line + "\n");
' "$INPUT" "$DATA_DIR" 2>/dev/null
exit 0
