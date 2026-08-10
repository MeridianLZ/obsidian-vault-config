#!/usr/bin/env bash
# preToolUse fence: DENY any mutation of curated vault paths, and any git
# history-rewrite / working-tree mutation, unless a live single-use gate token
# (ACCEPT verdict, proposal- and path-scoped) is presented.
# Allows 01-inbox/ and today's daily. Reads hook JSON on stdin; emits a
# permissionDecision JSON on stdout. Exit 2 = fail-closed on internal error.
#
# Deny-by-default: a shell command that references a curated path is denied
# unless its verb is on the read-only allowlist. Paths are canonicalized
# (absolute, ./, ../ traversal all normalize) before matching.
#
# Payload compat: accepts both Copilot CLI keys (toolName/toolArgs) and
# VS Code-style keys (tool_name/tool_input) — unknown shapes fail CLOSED.
#
# Usage: guard-curated-paths.sh   (invoked by Copilot CLI hooks runtime; no args)
set -uo pipefail
Usage() { echo "Usage: invoked as a Copilot CLI preToolUse hook; reads JSON on stdin"; exit 2; }
[ $# -gt 0 ] && Usage

INPUT="$(cat)"
DATA_DIR="${COPILOT_PLUGIN_DATA:-${HOME}/.copilot/plugin-data/vault-curator}"
TOKEN_DIR="${DATA_DIR}/tokens"
TODAY="$(date +%F)"
VAULT="${VAULT_PATH:-$PWD}"

node -e '
const fs = require("fs"), path = require("path");
let input;
try { input = JSON.parse(process.argv[1] || ""); } catch { process.exit(2); }   // fail-closed
const today = process.argv[2], tokenDir = process.argv[3], vault = process.argv[4];

// --- payload-shape compat: CLI camelCase OR VS Code snake_case; neither → fail closed ---
const toolName = String(input.toolName ?? input.tool_name ?? "").toLowerCase();
const args = input.toolArgs ?? input.tool_input ?? null;
if (!toolName || args === null || typeof args !== "object") process.exit(2);

const CURATED = ["10-notes","20-tasks","40-sources","50-entities","90-archive","00-system"];
const allow = () => { console.log(JSON.stringify({ permissionDecision: "allow" })); process.exit(0); };
const deny = (reason) => { console.log(JSON.stringify({ permissionDecision: "deny", permissionDecisionReason: reason })); process.exit(0); };

// --- canonicalize any path-like string to a vault-relative path, or null if outside vault ---
function vaultRel(p) {
  const abs = path.resolve(vault, String(p));           // handles absolute, ./, ../
  const rel = path.relative(vault, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;  // outside vault
  return rel.split(path.sep).join("/");
}
const isCurated  = (rel) => rel !== null && CURATED.some((c) => rel === c || rel.startsWith(c + "/"));
const isInbox    = (rel) => rel !== null && (rel === "01-inbox" || rel.startsWith("01-inbox/"));
const isTodaysDaily = (rel) => rel === `30-daily/${today}.md`;
const isDailyDir = (rel) => rel !== null && (rel === "30-daily" || rel.startsWith("30-daily/"));

// --- gate-token verification: single-use, proposal- AND path-scoped, 10-minute TTL ---
// Token file content (written by gate-server): {"proposal_id":"…","targets":["<vault-rel path>", …]}
function tokenAuthorizes(rel) {
  const tok = process.env.GATE_TOKEN || args.gate_token;
  if (!tok || !/^gt_[A-Za-z0-9_-]+$/.test(tok)) return false;
  const f = path.join(tokenDir, tok);
  let scope;
  try {
    const st = fs.statSync(f);
    if (Date.now() - st.mtimeMs > 10 * 60 * 1000) { fs.unlinkSync(f); return false; }
    scope = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch { return false; }
  const ok = Array.isArray(scope.targets) &&
    scope.targets.some((t) => t === rel || t === "*" && false);   // exact-path scope; no wildcards
  if (ok) fs.unlinkSync(f);                                       // single-use: consume only on match
  return ok;
}

// --- shell tools: deny-by-default when a curated path is referenced ---
if (toolName === "shell" || toolName === "bash") {
  const cmd = String(args.command ?? args.cmd ?? "");
  if (!cmd) process.exit(2);

  // 1. git history rewrite + working-tree mutation (these mutate curated files via git itself)
  const GIT_DENY = /\bgit\b[^|;&]*\b(rebase|--amend|push[^|;&]*(-f\b|--force|\+\S+:)|filter-(branch|repo)|reflog\s+(expire|delete)|update-ref|branch\s+(-f|--force)|checkout|restore|reset|clean|rm|mv|stash|apply|am\b|cherry-pick|revert|merge)\b/;
  if (GIT_DENY.test(cmd) && !tokenScopedGitOk(cmd))
    deny("Git commands that rewrite history or mutate the working tree are Curator-gated (curator.agent.md §4). Read-only git (status/log/diff/show/blame/rev-parse/grep) is allowed.");

  // 2. any reference to a curated path → allow ONLY read-only verb prefixes.
  // Two detectors: (a) tokenized path refs (handles absolute/traversal via canonicalization),
  // (b) raw substring scan for a curated folder segment — catches paths buried inside
  // quoted interpreter strings (python -c "open('10-notes/x.md')") the tokenizer splits wrong.
  const refs = extractPathRefs(cmd);
  const curatedRefs = refs.filter((r) => isCurated(r) || (isDailyDir(r) && !isTodaysDaily(r) && r !== "30-daily"));
  const substringHit = new RegExp(`(^|[^\\w/])(${CURATED.join("|")})/`).test(cmd)
    || new RegExp(`/(${CURATED.join("|")})/`).test(cmd);   // also matches inside an absolute path
  if (curatedRefs.length || substringHit) {
    const READONLY = /^\s*(command\s+)?(ls|cat|head|tail|wc|grep|rg|find|file|stat|diff|md5|shasum|sha256sum|awk\b(?![^|;&]*-i)|sed\b(?![^|;&]*-i)|sort|uniq|cut|tr|jq|yq|less|more|open\s+-R|git\s+(status|log|diff|show|blame|rev-parse|grep|ls-files|shortlog|describe|cat-file))\b[^|;&<>]*$/;
    // single simple read-only command, no redirects/pipes-to-writes → allow; anything else needs a token
    const simple = READONLY.test(cmd) && !/[>]|\btee\b|\bxargs\b/.test(cmd);
    if (!simple) {
      const rel = curatedRefs[0] ?? "(curated path)";
      // substring-only hits (no clean canonical ref) can never present a matching token → always deny
      if (!curatedRefs.length || !tokenAuthorizes(rel))
        deny(`Shell command references a Curator-gated path (${rel}) and is not a simple read-only command. Submit via curator_propose; an ACCEPT verdict issues a path-scoped gate token. (vault-curator fence)`);
    }
  }
  allow();
}

function tokenScopedGitOk() { return false; }  // git-level mutations never token-bypassed; Curator itself commits

// pull path-looking tokens out of a shell command (quoted or bare), incl. absolute
function extractPathRefs(cmd) {
  const out = [];
  const re = /"([^"]+)"|'"'"'([^'"'"']+)'"'"'|(\S+)/g;
  let m;
  while ((m = re.exec(cmd))) {
    const t = m[1] ?? m[2] ?? m[3];
    if (!t || t.startsWith("-")) continue;
    if (/[\/]/.test(t) || CURATED.some((c) => t === c) ) {
      const rel = vaultRel(t.replace(/^["'\''"]|["'\''"]$/g, ""));
      if (rel !== null) out.push(rel);
    }
  }
  return out;
}

// --- file-edit tools: canonicalize target, then zone rules ---
const target = String(args.path ?? args.file_path ?? args.filePath ?? "");
if (!target) allow();          // no path → not a file mutation we govern
const rel = vaultRel(target);
if (rel === null) allow();     // outside the vault → not ours
if (isInbox(rel)) allow();     // quarantine zone: free capture
if (isTodaysDaily(rel)) allow();
if (isCurated(rel) || isDailyDir(rel)) {
  if (!tokenAuthorizes(rel))
    deny(`${rel} is Curator-gated. Direct mutation denied — submit via curator_propose (lane B) or /agent curator (lane A). An ACCEPT verdict mints a single-use, path-scoped gate token. (vault-curator fence)`);
}
allow();
' "$INPUT" "$TODAY" "$TOKEN_DIR" "$VAULT" 2>/dev/null
RC=$?
[ "$RC" = 0 ] || exit 2   # any internal failure → fail-closed
