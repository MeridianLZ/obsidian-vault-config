# vault-curator

Copilot CLI plugin implementing `curator-plugin-spec.md` v1.0.0 — the Curator as an installable, versioned governance package: two lanes, one gate.

## Contents

| Slot | Contents |
|---|---|
| `agents/` | `curator` (the gate, unchanged from spec) + 6 specialty stewards: `maintenance`, `semantic-curation`, `housecleaning`, `ontological-enforcement`, `self-healing`, `taxonomical-evolution`. All route mutations through the gate; none bypass. |
| `skills/` | 7 playbooks: `gate-mutation`, `daily-drain`, `promote-capture`, `taxonomy-review`, `retention-sweep`, `erasure-request` (Curator-side) and `vault-retrieval` (primary-agent-side routing map). |
| `hooks/` | GA `hooks.json` (version 1 schema) + 4 scripts: the **fence** (`guard-curated-paths.sh`, preToolUse), context injection (`session-vault-guide.sh`, sessionStart), write telemetry (`audit-emit.sh`, postToolUse), injection scan (`prompt-injection-scan.sh`, userPromptSubmitted). |
| `gate-server/` | Lane B: zero-dependency stdio MCP server (`curator_propose` / `curator_status` / `curator_report` / `curator_invoke`) wrapping `copilot --agent curator -p …` headlessly. Single-flight per vault; ACCEPT verdicts mint single-use, 10-minute, proposal-scoped gate tokens consumed by the fence. |
| `.mcp.json` | Activates `vault-read` (the `vault-mcp` server, readonly) + `curator-gate`. |

## The fence (verified behavior)

`preToolUse` denies — deterministically, regardless of what any model decides:

- file mutations under `10-notes/ 20-tasks/ 40-sources/ 50-entities/ 90-archive/ 00-system/` and non-today dailies, unless a live gate token is presented (single-use: consumed on first check)
- `git rebase / commit --amend / push --force / filter-branch / reflog expire`
- any shell touching `00-system/audit/`

Allows: `01-inbox/`, today's daily, read-only shell. Exit 2 = fail-closed.

## Install

```bash
copilot plugin install ./vault-curator          # dev (reinstall after changes — cached)
/plugin list · /agent · /skills list            # verify
```

Set `VAULT_PATH` (and optionally `VAULT_MCP_DIST`, `VAULT_CLEARANCE`) in the environment; runtime state lives in `${COPILOT_PLUGIN_DATA}` (tokens, proposal queue, reports, write-audit JSONL) — never in the cached install dir.

Enterprise: register via internal `marketplace.json`, push with `managed-settings.json` (`extraKnownMarketplaces` + `enabledPlugins` + `strictKnownMarketplaces: true`) per spec §7.

## Test

```bash
# gate-server (no copilot needed):
node gate-server/index.js --vault ../vault-mcp/test-fixture --dry-run
# fence battery (11 checks: curated-deny, inbox/daily-allow, rebase/audit-deny,
# token allow-once-then-deny, injection scan, guide injection):
./test-plugin.sh
```

Full acceptance (needs a live Copilot CLI seat) = spec §9 steps 1–6.

## Interop (lane B consumers)

Claude Code / Codex / CI: register both servers from `.mcp.json` in their MCP config. Skills/hooks don't travel — those clients rely on `get_vault_guide` + the server-side facts: `vault-read` is readonly by construction, `curator-gate` is the only mutation path they can see.
