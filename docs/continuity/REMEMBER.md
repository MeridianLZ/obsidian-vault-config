# REMEMBER (append-only)

## 2026-08-10 (audit remediation)

- **node:sqlite (Node 24 built-in) has FTS5 + bm25 + snippet** — verified. It is
  the air-gap-safe SQLite: no native module, no npm. API differs from
  better-sqlite3: `new DatabaseSync(path)`, no `.pragma()` (use `exec("PRAGMA…")`),
  no `.transaction()` (use explicit BEGIN/COMMIT/ROLLBACK). `.prepare().all()/.run()` same.
- **The MCP server ships as a COMMITTED esbuild bundle** `vault-mcp/bin/vault-mcp.mjs`
  (ESM — CJS can't do the top-level await in index.ts). Rebuild: `npm run build`.
  Runs with node_modules absent. This is what deploy uses; dist/ (tsc) stays gitignored.
- **Copilot CLI does NOT expand `${VAR}`/`${VAR:-default}` in .mcp.json** — passes
  literal. `deploy/install-plugin.sh` writes ABSOLUTE paths. Never hand-write .mcp.json.
- **copilot-cli#2540: plugin-defined preToolUse hooks may not fire.** Mitigation:
  the fence is mirrored at `.github/hooks/` (repo-level load path, scripts symlinked
  to the plugin's). DEPLOY.md acceptance check #1 verifies firing before trusting the vault.
- **The fence is deny-by-default with canonicalized paths.** Any curated-path
  reference in a shell command that isn't a simple read-only verb → deny. Paths
  normalized via path.resolve (absolute/./../ all collapse). Substring scan catches
  paths buried in interpreter strings the tokenizer splits wrong. Fail-closed (exit 2)
  on unknown payload shape. Gate tokens are JSON {proposal_id, targets[]}, path-scoped,
  single-use, 10-min TTL.
- **Compliance parsing fails SAFE**: unknown classification → restricted (not internal);
  legal_hold/pii truthy-string aware; compliance registers include drafts + archive.
- **schema_drift is the deterministic ontology enforcer** — now checks enum membership,
  status-per-type, tag depth ≤3, ≤5 tags, hold_ref, verified-without-source, collisions.
  Empty on a fresh init-vault. This is the machine-check the curator agent relies on.
- **retention_until is DERIVED not guessed** — `00-system/schema/retention-rules.md`
  has the record_class→period table; multiple classes → max date; legal_hold overrides.

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
