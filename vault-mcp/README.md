# vault-mcp

Read-surface MCP server implementing `mcp-read-surface-spec.md` v2.0.0 for the compliance knowledge vault.

## Run

```bash
npm install && npm run build
node dist/index.js --vault /path/to/vault --clearance internal
```

| Flag | Long | Meaning |
|---|---|---|
| `-v` | `--vault` | vault root (required) |
| `-c` | `--clearance` | `public·internal·confidential·restricted` (default `internal`) — R2 server-side filter, never caller-supplied |
| `-e` | `--embedder` | `none` (default) or `onnx:<path>` — see Degraded semantic angle |
| `-d` | `--db` | SQLite path (default in-memory, rebuilt on start) |
| `-r` | `--readonly` | default and only mode |

## What's implemented

All 44 tools of spec angles 1–9. Angle 10 (`curator_propose`/`curator_status`/`curator_report`) lives in the **curator-gate** server (`vault-curator/gate-server`), not here — this server is read-only by construction (R1: every tool ships `readOnlyHint: true`).

- **Conventions R1–R6** enforced: read-only annotations, server-side clearance filtering *before* ranking (over-clearance hits surface as `{redacted: true}` stubs), the common filter block on every search/traversal tool, the uniform result envelope with per-hit `why` fusion provenance, ULID-`id` keying, zero network calls.
- **Lexical**: SQLite FTS5/BM25, field-weighted (title 4×, aliases 3×, headings 2×, summary 2×, body 1×), porter+unicode61.
- **Hybrid `search`**: RRF fusion; `auto` routes by query shape and reports its choice in `strategy`.
- **Graph**: typed edges (`up`/`related`/`source`) + body wikilinks with sentence context and `## Related` rationale clauses; BFS paths, PageRank, Brandes betweenness, label-prop communities, up-cycle detection.
- **Temporal**: git-backed — `note_history` parses the curator commit contract, `record_as_of` = `git show` behind a tool, `attention`, `audit_query` parses `00-system/audit/`.
- **Compliance**: retention register, disposal docket, hold set, `pii_map` (clearance-gated at `restricted`), `schema_drift` against the constitution.
- **Bases**: `.base` DSL evaluator subset (filters and/or, `==` `!=` `<` `>` `<=` `>=`, `file.inFolder`, day-age formula) — `query_base` + `board` sugar.
  <!-- ponytail: DSL subset covers the shipped .base files; extend evalExpr when a base uses more -->

## Degraded semantic angle (deliberate)

Spec R6 requires *local* embeddings; this deployment machine bans local model weights (disk-constrained). Resolution: `semantic_search` / `similar_notes` / `similar_to_text` / `suggest_links` and the dense hybrid channel run a lexical token-set fallback and return `status: "degraded"` with an explicit recommendation. Configure `--embedder onnx:<model>` on a machine with headroom to light up the dense channel. No spec surface was removed.

## Test

```bash
npm run build
node smoke.mjs                 # restricted: 23 assertions
node smoke.mjs -c internal     # 24 (clearance-scoped register/hold counts)
node smoke.mjs -c public       # 5 (R2: fixture invisible, stubs only)
```

Fixture vault in `test-fixture/` (own git repo — powers the temporal angle tests).
