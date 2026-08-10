# REMEMBER (append-only)

## 2026-08-10

- **This repo is the kit, not the vault.** No live vault instance exists; constitution
  §8 checklist runs at deployment. Root spec files double as 00-system/schema/ payloads.
- **KB project name is `master-kb`** — the kb-prime skill's `agent-kb`/`agentic-kb`
  names are stale. Root anchor: `document/fundamental-agent-kb-root`.
- **Copilot GA hooks schema ≠ curator-plugin-spec §5 sketch.** GA: `{version:1,
  hooks:{preToolUse:[{type:"command",bash:…,matcher:"regex"}]}}`, stdin JSON payload,
  stdout `{"permissionDecision":"allow|deny|ask"}`, matchers anchored `^(?:…)$`,
  timeouts fail-open EXCEPT preToolUse (fail-closed), exit 2 = fail-closed. Build to
  GA, not to the spec sketch.
- **MCP SDK split (2026-07-28):** v1 = `@modelcontextprotocol/sdk` (1.30, still
  updated, import `…/server/mcp.js`); v2 = `@modelcontextprotocol/server` +
  `…/client`. We pin v1.
- **largo constraint honored via config, not descoping:** semantic tools ship full
  spec surface behind pluggable embedder; `none` default → `status:"degraded"` +
  recommendation. Never `ollama pull`/HF downloads here.
- **bm25() in SQLite FTS5 returns negative-is-better** — invert sign before fusing
  (vault-mcp/src/search.ts ftsQuery).
- **test-fixture is generated + gitignored** (nested git repo powers temporal tools;
  tracking it creates a gitlink). Regen: `vault-mcp/make-fixture.sh`.
- **Gate tokens:** minted by gate-server on ACCEPT into `${COPILOT_PLUGIN_DATA}/tokens/`,
  single-use (consumed on first fence check), 10-min TTL. Fence env: `GATE_TOKEN`.
- **Obsidian link resolution needs normKey** (space↔dash, case) — titles are
  filenames; `[[Payments Operations]]` must resolve `payments-operations.md`.
