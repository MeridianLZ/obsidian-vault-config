#!/usr/bin/env bash
# preToolUse fence: DENY any file mutation under curated paths, and any git
# history-rewrite, unless a live single-use gate token (ACCEPT verdict) is presented.
# Allows 01-inbox/ and today's daily. Reads hook JSON on stdin; emits a
# permissionDecision JSON on stdout. Exit 2 = fail-closed on internal error.
#
# Usage: guard-curated-paths.sh   (invoked by Copilot CLI hooks runtime; no args)
set -uo pipefail
Usage() { echo "Usage: invoked as a Copilot CLI preToolUse hook; reads JSON on stdin"; exit 2; }
[ $# -gt 0 ] && Usage

INPUT="$(cat)"
DATA_DIR="${COPILOT_PLUGIN_DATA:-${HOME}/.copilot/plugin-data/vault-curator}"
TOKEN_DIR="${DATA_DIR}/tokens"
TODAY="$(date +%F)"

node -e '
const input = JSON.parse(process.argv[1] || "{}");
const toolName = (input.toolName || "").toLowerCase();
const args = input.toolArgs || {};
const today = process.argv[2];
const tokenDir = process.argv[3];
const fs = require("fs");

const CURATED = /^(10-notes|20-tasks|40-sources|50-entities|90-archive|00-system)\//;
const HISTORY_REWRITE = /git\s+(rebase|commit\s+--amend|push\s+.*--force|filter-branch|reflog\s+(expire|delete))/;
const AUDIT_TOUCH = /(rm|mv|>\s*|>>\s*|sed\s+-i|tee\s).*00-system\/audit\//;

const allow = () => { console.log(JSON.stringify({ permissionDecision: "allow" })); process.exit(0); };
const deny = (reason) => { console.log(JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: reason })); process.exit(0); };

// --- gate-token verification: single-use, proposal-scoped, 10-minute TTL ---
function tokenValid() {
  const tok = process.env.GATE_TOKEN || args.gate_token;
  if (!tok || !/^gt_[A-Za-z0-9_-]+$/.test(tok)) return false;
  const f = tokenDir + "/" + tok;
  try {
    const st = fs.statSync(f);
    if (Date.now() - st.mtimeMs > 10 * 60 * 1000) { fs.unlinkSync(f); return false; }
    fs.unlinkSync(f); // single-use: consume on first successful check
    return true;
  } catch { return false; }
}

// --- shell tools: inspect the command string ---
if (toolName === "shell" || toolName === "bash") {
  const cmd = String(args.command ?? args.cmd ?? "");
  if (HISTORY_REWRITE.test(cmd)) deny("SEC 17a-4: git history rewrite forbidden (curator.agent.md §4). The audit trail must remain recreatable.");
  if (AUDIT_TOUCH.test(cmd)) deny("SEC 17a-4: 00-system/audit/ is append-only via the Curator gate (curator.agent.md §5).");
  // heuristic: redirect/in-place-edit targeting curated paths
  const m = cmd.match(/(?:^|[\s>])((?:10-notes|20-tasks|40-sources|50-entities|90-archive|00-system)\/[^\s"'';|&]*)/);
  if (m && /(>|>>|sed\s+-i|tee\s|rm\s|mv\s|cp\s.*\s)/.test(cmd)) {
    if (!tokenValid()) deny(`Curated path ${m[1]} mutates only through the Curator gate. Submit via curator_propose; an ACCEPT verdict issues a gate token. (vault-curator fence)`);
  }
  allow();
}

// --- file-edit tools: inspect the target path ---
const target = String(args.path ?? args.file_path ?? args.filePath ?? "");
if (!target) allow();
const rel = target.replace(/^.*?(?=(00-system|01-inbox|10-notes|20-tasks|30-daily|40-sources|50-entities|90-archive)\/)/, "");
if (rel.startsWith("01-inbox/")) allow();                               // quarantine zone: free capture
if (rel === `30-daily/${today}.md`) allow();                            // proposer'\''s own daily
if (CURATED.test(rel) || rel.startsWith("30-daily/")) {
  if (!tokenValid()) deny(`${rel} is Curator-gated. Direct mutation denied — submit a proposal via curator_propose (lane B) or /agent curator (lane A). An ACCEPT verdict mints a single-use gate token. (vault-curator fence)`);
}
allow();
' "$INPUT" "$TODAY" "$TOKEN_DIR" 2>/dev/null || exit 2
