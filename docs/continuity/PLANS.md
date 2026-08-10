# PLANS

## Goal

Ship the governed Obsidian compliance-vault stack defined by the three root specs:
`00-vault-initial-state.md` (schema constitution), `mcp-read-surface-spec.md` v2.0.0
(read surface), `curator-plugin-spec.md` v1.0.0 (governance plugin).

## Phases

| Phase | Scope | Status |
|---|---|---|
| P0 | Repo dedupe, canonical layout | ✅ done (8c3ce8a, 2026-08-10) |
| P1 | vault-mcp read server (41 tools, angles 1–9) | ✅ done (6d7bbe0, 4b74e11) |
| P2 | vault-curator Copilot CLI plugin (agents/skills/hooks/gate-server) | ✅ done (c66e906) |
| P3 | Primary-agent `.copilot/skills/` + workflow-registry.md | ✅ done (99f9a34) |
| P4 | Deployment wiring | ⏳ open — see gaps |

## Current facts

- Stack: TypeScript, `@modelcontextprotocol/sdk` 1.30 (v1 stable; v2 = `@modelcontextprotocol/server`, 2026-07-28 spec), better-sqlite3 FTS5, zero-dep gate-server.
- Copilot CLI GA (2026-02-25); hooks built to GA schema (`{version:1, hooks:{preToolUse:[…]}}`, `permissionDecision` output, exit-2 fail-closed) — spec §5 sketch predates GA.
- Semantic angle degraded-by-config on largo (no local models rule); embedder pluggable (`--embedder onnx:<path>` elsewhere).
- Vault itself does not exist yet as a live instance — repo is the kit; constitution §8 checklist executes at deployment.

## Non-goals

- C# hybrid-search in-app plugin (spec §12 parity matrix) — separate deliverable, not started, not requested.
- Local embedding models on largo — permanently banned (disk).
- Live Copilot seat acceptance runs (spec §9 lanes A/B) — needs a seat.

## P4 open items (from workflow-registry.md Gaps)

1. Cadence scheduler: cron/CI → headless `copilot --agent <steward>` runs (W12, W15–W18, W21, W24).
2. Post-accept re-index trigger (git post-commit → vault-mcp rescan) (W22).
3. Enterprise `managed-settings.json` push + internal marketplace.json (spec §7).
4. Vault instantiation per constitution §8 checklist.
