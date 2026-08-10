#!/usr/bin/env bash
# init-vault.sh — executable constitution §8 initial-state checklist.
# Materializes a schema-complete, empty Obsidian vault from this kit at a target
# path: folder tree, extracted templates, seeded schema files, bases, agent
# registrations, git epoch commit. Idempotent-ish: refuses a non-empty target
# unless --force.
#
# Usage:
#   deploy/init-vault.sh -t|--target <vault-dir> [-f|--force] [--no-git]
set -euo pipefail
Usage() {
  cat <<EOF
Usage: $0 -t|--target <vault-dir> [options]
  -t, --target <dir>   destination vault path (required; created if absent)
  -f, --force          proceed even if target is non-empty
      --no-git         skip git init + epoch commit + tag
  -h, --help           this text
EOF
  exit 2
}
TARGET="" ; FORCE=0 ; DO_GIT=1
while [ $# -gt 0 ]; do case "$1" in
  -t|--target) TARGET="${2:?}"; shift;;
  -f|--force) FORCE=1;;
  --no-git) DO_GIT=0;;
  -h|--help) Usage;;
  *) echo "unknown arg: $1"; Usage;;
esac; shift; done
[ -n "$TARGET" ] || Usage
KIT="$(cd "$(dirname "$0")/.." && pwd)"

# --- guard: non-empty target ---
if [ -e "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null || true)" ] && [ "$FORCE" != 1 ]; then
  echo "refusing: $TARGET is non-empty (use --force)"; exit 1
fi
mkdir -p "$TARGET"
TARGET="$(cd "$TARGET" && pwd)"
echo "→ initializing vault at $TARGET"

# --- §8.1 folder tree ---
for d in \
  00-system/templates 00-system/bases 00-system/schema 00-system/audit \
  01-inbox/_proposals 10-notes 20-tasks 30-daily \
  40-sources/_assets 50-entities 90-archive; do
  mkdir -p "$TARGET/$d"
done
# keep empty dirs in git
find "$TARGET" -type d -empty -exec sh -c 'touch "$1/.gitkeep"' _ {} \;

# --- §8.2 schema files: constitution + seeded registry + changelog + retention rules ---
cp "$KIT/00-vault-initial-state.md" "$TARGET/00-system/schema/00-vault-initial-state.md"
for f in tag-registry.md schema-changelog.md retention-rules.md; do
  [ -f "$KIT/schema/$f" ] && cp "$KIT/schema/$f" "$TARGET/00-system/schema/$f"
done

# --- §8.3 templates: extract the fenced block from each doc-wrapped template ---
extract() { awk '/^```markdown$/{f=1;next} /^```$/{if(f){exit}} f' "$1"; }
for tpl in "$KIT"/templates/tpl-*.md; do
  name="$(basename "$tpl")"
  extract "$tpl" > "$TARGET/00-system/templates/$name"
  [ -s "$TARGET/00-system/templates/$name" ] || { echo "FAIL: empty extraction $name"; exit 1; }
done

# --- §8.3 bases ---
cp "$KIT"/bases/*.base "$TARGET/00-system/bases/" 2>/dev/null || true

# --- §8.7 agent + house-rule registrations at vault root ---
mkdir -p "$TARGET/.github/agents" "$TARGET/.github/instructions" "$TARGET/.github/hooks/scripts" "$TARGET/.github/copilot"
cp "$KIT/.github/copilot-instructions.md" "$TARGET/.github/"
cp "$KIT/.github/instructions/"*.md "$TARGET/.github/instructions/" 2>/dev/null || true
cp "$KIT/.github/agents/"*.agent.md "$TARGET/.github/agents/" 2>/dev/null || true
# repo-level hook mirror (fires even if plugin hooks don't — copilot-cli#2540)
cp "$KIT/.github/hooks/vault-fence.json" "$TARGET/.github/hooks/"
cp "$KIT"/vault-curator/hooks/scripts/*.sh "$TARGET/.github/hooks/scripts/"
chmod +x "$TARGET/.github/hooks/scripts/"*.sh
cp "$KIT/.github/copilot/settings.json" "$TARGET/.github/copilot/settings.json"

# --- .obsidian core-plugin config seed (manual §7) ---
cp -R "$KIT/deploy/obsidian-config/." "$TARGET/.obsidian/" 2>/dev/null || true

# --- first empty audit month + a .gitignore for the live vault ---
printf '# Curator audit log — %s (append-only, legal_hold)\n' "$(date +%Y-%m)" > "$TARGET/00-system/audit/$(date +%Y-%m).md"
cat > "$TARGET/.gitignore" <<'EOF'
.DS_Store
.obsidian/workspace*.json
.obsidian/cache
*.tmp
EOF

# --- AUTHORITATIVE backstop (audit R1): pre-commit inspects the ACTUAL staged diff.
#     The regulated record is committed state; a working-tree mutation that slipped
#     past the best-effort shell fence is caught here when it tries to become a
#     commit. Curated-path changes are rejected unless a live gate token authorizes
#     exactly those paths (the gate-server mints one per ACCEPT). ---
mkdir -p "$TARGET/.githooks"
cat > "$TARGET/.githooks/pre-commit" <<'HOOK'
#!/usr/bin/env bash
# Reject staged changes under curated paths unless a live gate token authorizes them.
set -uo pipefail
CURATED_RE='^(10-notes|20-tasks|40-sources|50-entities|90-archive|00-system)/'
STAGED="$(git diff --cached --name-only || true)"
CURATED_CHANGES="$(printf '%s\n' "$STAGED" | grep -E "$CURATED_RE" || true)"
[ -z "$CURATED_CHANGES" ] && exit 0   # nothing curated staged → fine (inbox/daily/etc.)

# audit dir is append-only and NEVER staged by a normal commit path except the Curator's
DATA_DIR="${COPILOT_PLUGIN_DATA:-${HOME}/.copilot/plugin-data/vault-curator}"
TOKENS="$DATA_DIR/tokens"
tok="${GATE_TOKEN:-}"
if [ -n "$tok" ] && [ -f "$TOKENS/$tok" ]; then
  # token must cover every staged curated path (append-only audit lines under
  # 00-system/audit/ ride along with the commit they document — allowed here).
  ok=1
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in 00-system/audit/*) continue;; esac   # audit line for this mutation
    grep -q "\"$f\"" "$TOKENS/$tok" || ok=0
  done <<< "$CURATED_CHANGES"
  if [ "$ok" = 1 ]; then exit 0; fi   # authorized; token reaped by TTL (supports edit+commit)
fi
echo "pre-commit: BLOCKED — curated-path changes without an authorizing gate token:" >&2
printf '  %s\n' $CURATED_CHANGES >&2
echo "Route this through the Curator gate (curator_propose). The git history is a 17a-4 audit trail." >&2
exit 1
HOOK
chmod +x "$TARGET/.githooks/pre-commit"

# --- post-accept re-index hook (W22): signal the MCP server to rescan after each commit ---
cat > "$TARGET/.githooks/post-commit" <<'HOOK'
#!/usr/bin/env bash
# Poke the vault-read MCP server to re-index after an accepted mutation.
# Writes a sentinel the server watches (mtime-triggered rescan); harmless if the
# server runs on-demand (it scans on boot).
touch "$(git rev-parse --show-toplevel)/00-system/.reindex-request" 2>/dev/null || true
HOOK
chmod +x "$TARGET/.githooks/post-commit"

# --- §8.6 git epoch ---
if [ "$DO_GIT" = 1 ]; then
  if [ ! -d "$TARGET/.git" ]; then git -C "$TARGET" init -q; fi
  git -C "$TARGET" add -A
  # The epoch IS the trusted initial state — commit it BEFORE activating the
  # pre-commit fence (which would otherwise reject the schema files themselves).
  git -C "$TARGET" commit -q -m "vault: schema-complete initial state

The audit-trail epoch (SEC 17a-4). Empty corpus, full schema: folder tree,
templates, tag registry, bases, agent registrations." || echo "(nothing to commit)"
  git -C "$TARGET" tag -f v1.0.0-initial-state >/dev/null
  git -C "$TARGET" config core.hooksPath .githooks   # activate fence AFTER the epoch
  echo "→ git epoch committed + tagged v1.0.0-initial-state; pre-commit fence now active"
fi

echo "✓ vault initialized. Next: run deploy/install-plugin.sh, then open in Obsidian and enable community plugins (manual §7)."
