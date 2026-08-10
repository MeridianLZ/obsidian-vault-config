# MCP Read Surface Specification — The Full Retrieval Arsenal

**Version:** 2.0.0 · **Supersedes:** the four-tool sketch in manual §8.2
**Implementors:** the vault MCP server (consumed by GitHub Copilot CLI and any MCP client) and the C# hybrid-search plugin (in-app surface; shares the same index and, where applicable, the same tool semantics)
**Governing doc:** `00-vault-initial-state.md` (schema constitution) — every tool below reads the contract defined there.

This spec catalogs **every read mechanism** the vault exposes, organized by retrieval angle. It is a synthesis of the 2026 SOTA across the Obsidian MCP ecosystem — chunk-level RRF hybrid search with graph analytics (obsidian-brain), 28-tool structural/temporal surfaces (obsidian-emergent-mcp), FTS5+vector+cross-encoder pipelines with kanban awareness (Vault Cortex), section/block/Bases/attachment granularity with safety annotations (obsidian-mcp-pro), self-describing vault guides (maxkuminov/obsidian-mcp), block-tree context-carrying search (graphthulhu), temporal knowledge graphs (MegaMem/Graphiti), and graph-RAG chunk-relationship metadata (graph-rag-mcp-server) — recomposed for *this* vault's typed schema, Curator governance, and regulatory posture.

---

## 0. Cross-Cutting Conventions

Every tool in this catalog obeys these rules; they are not repeated per tool.

**R1 — Read-only annotations.** All tools here are declared with MCP safety annotations `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`. Mutations exist *only* behind the Curator gate (see `curator-plugin-spec.md` §4); this server ships a `--readonly` mode that is the default and the only mode granted to primary agents.

**R2 — Classification enforcement is server-side.** Every tool takes an implicit `clearance` from the session context (configured at server registration, never caller-supplied) and filters results where `classification > clearance` **before** ranking and **before** snippet extraction. A redacted hit may appear as `{id, title, classification, redacted: true}` so agents know something exists without seeing it (GLBA least-privilege with discoverability). `pii: true` bodies follow deployment policy: `summary`-only serving unless clearance + purpose flags permit.

**R3 — Scope filters everywhere.** Every search/traversal tool accepts the common filter block:
```jsonc
{ "type": ["note","source","entity","task","daily"],   // schema types
  "status": ["active"],                                 // lifecycle
  "tags": ["#domain/payments"],                         // registry tags, AND semantics
  "folder": "10-notes",                                 // path scope
  "classification_max": "internal",                     // *narrow* below clearance
  "record_class": ["sec-17a4"],                         // compliance bucket
  "modified_after": "2026-01-01", "modified_before": null,
  "include_drafts": false, "include_archive": false }
```

**R4 — Result envelope.** Structured, uniform, diagnosable (pattern per graph-rag-mcp-server's smart-search contract):
```jsonc
{ "schema_version": "2.0",
  "status": "ok | degraded | error",
  "strategy": "hybrid+rerank",          // what actually ran
  "confidence": 0.83,                   // composite, when meaningful
  "hits": [ { "id": "…", "path": "…", "title": "…", "score": 0.91,
              "summary": "…", "snippet": "…", "chunk_ref": "id#h2/3",
              "classification": "internal", "why": "bm25:cutoff, dense:0.88, graph:1-hop from [[Reg E]]" } ],
  "diagnostics": { "candidates": 120, "fused": 40, "reranked": 20,
                   "timings_ms": {"sparse": 4, "dense": 11, "rerank": 38},
                   "warnings": [] },
  "recommendations": []                 // populated when degraded
}
```
The `why` field — per-hit fusion provenance — is mandatory: agents that can see *why* a hit ranked make better follow-up tool calls.

**R5 — Everything keys on `id`.** Paths are convenience; the ULID `id` from frontmatter is the stable key across renames, and `chunk_ref` = `id` + heading-path ordinal.

**R6 — Air-gap invariant.** All embedding, reranking, and graph computation is local (on-box models, SQLite FTS5 + local vector store + in-memory graph). No tool may induce a network call.

---

## 1. Identity & Resolution Angle
*"Turn a fuzzy human/agent reference into the exact record."*

| Tool | Params | Returns | Notes |
|---|---|---|---|
| `resolve` | `name`, `fuzzy?` | ranked `{id, path, title, matched_via}` | Matches title → aliases → fuzzy-trigram. The alias discipline in the templates is this tool's fuel. |
| `read_note` | `id\|path`, `mode: full\|body\|frontmatter`, `follow_embeds?` | note content + typed frontmatter | `follow_embeds` inlines `![[…]]` one level with provenance markers. |
| `read_section` | `id`, `heading_path` ("H1::H2"), or `block_id`, or `lines:[a,b]` | fragment + its heading breadcrumb | Surgical reads keep agent context lean — never ship a 4k-token note when the caller wants one procedure. |
| `read_property` | `id`, `field` | value, **original type preserved**, distinguishing missing vs `null` | |
| `get_vault_guide` | — | this spec's authoring rules + the schema constitution + tag registry, live | The self-describing-vault pattern: every connecting agent calls it once per session and knows how the vault works; update the file, every agent updates. This is `copilot-instructions` for *non-Copilot* MCP clients. |
| `list_notes` | filters (R3), `sort`, `limit`, `cursor` | paged listing with `summary` per hit | Browse without search. |
| `get_attachment` | `path` | base64 + MIME | `40-sources/_assets/` evidence artifacts; `doc_hash` returned alongside for integrity checks. |

## 2. Lexical / FTS Angle
*"Exact words, identifiers, jargon, regex — the precision channel."*

| Tool | Params | Returns | Notes |
|---|---|---|---|
| `fts_search` | `query` (FTS5 syntax: phrases, NEAR, prefix), filters | envelope; snippets query-centered | SQLite FTS5 BM25 over title+aliases+headings+body, field-weighted (title 4×, aliases 3×, headings 2×, summary 2×, body 1×). |
| `regex_search` | `pattern`, `context_lines`, filters | matches with surrounding context | The grep escape hatch; capped result size. |
| `property_query` | `expr` — JsonLogic-style over typed frontmatter: `{"and":[{"==":["type","task"]},{"<":["due","2026-09-01"]}]}` | matching notes + the queried fields | The "vault as database" tool for arbitrary property predicates beyond R3's common filters. |
| `tag_index` | `prefix?` | every tag + usage counts, hierarchical rollup to parents | Sourced from the *parser's authoritative index* (inline + frontmatter, code-blocks excluded) — text search systematically over/under-counts tags; this doesn't. Also the Curator's taxonomy-drift input. |
| `query_base` | `base_path` or inline base YAML, `view?` | rows exactly as Obsidian's Bases engine would compute them | Evaluates `.base` filter/formula DSL server-side — the kanban board, compliance register, and review queues become queryable by agents *identically to what humans see*. One source of truth for "what's on the board." |

## 3. Semantic Angle
*"Meaning over wording — the recall channel."*

| Tool | Params | Returns | Notes |
|---|---|---|---|
| `semantic_search` | `query`, `granularity: chunk\|note`, filters, `limit` | envelope; chunk hits carry heading breadcrumb | Local embeddings; chunk-level vectors at `##` granularity with heading-path prefixes (per the index contract), note-level = the `summary` embedding. |
| `similar_notes` | `id`, `limit` | neighbors by stored vectors — **no live embed call** | Reuses the source note's chunk vectors, anchored to its opening topic. Cheap "what else is like this." |
| `similar_to_text` | `text`, filters | as above for pasted text | "Does the vault already know this?" — the Primary agent's dedup pre-check before proposing a new note to the Curator. |

## 4. Hybrid & Fused Angle
*"The default front door."*

| Tool | Params | Returns | Notes |
|---|---|---|---|
| `search` | `query`, `mode: hybrid\|sparse\|dense\|auto`, `rerank?: true`, filters, `limit` | envelope | **The primary retrieval tool.** Sparse (FTS5) + dense (chunk vectors) fused via **Reciprocal Rank Fusion**, then an optional local **cross-encoder rerank** of the top ~20 for intent-heavy queries. `auto` routes by query shape (quoted strings/identifiers → sparse-weighted; question-form → dense-weighted + rerank) and reports its choice in `strategy`. |
| `answer_context` | `query`, `budget_tokens`, filters | an assembled context pack: top chunks + their `summary` headers + 1-hop `## Related` rationales, deduped, under budget | Retrieval-for-generation: the tool that turns "answer from the vault" into one call instead of six. Citations (`id#chunk_ref`) attached per span. |

## 5. Graph Traversal Angle
*"Logically connected ≠ textually similar. The multi-hop channel."*

| Tool | Params | Returns | Notes |
|---|---|---|---|
| `backlinks` | `id`, `include_context?` | linking notes + the *sentence containing the link* | Context-carrying backlinks (graphthulhu pattern): the sentence around the link is the edge's meaning. |
| `outlinks` | `id`, `edge_types?: [body, up, related, source]` | outgoing edges, typed | Typed-edge filtering: `source` edges alone = the evidence chain. |
| `neighborhood` | `id`, `depth` (≤3), `direction`, `edge_types?`, filters | subgraph `{nodes[], edges[]}` with per-node `summary` | The local map. Depth-capped; node payloads are summaries, not bodies. |
| `path_between` | `id_a`, `id_b`, `max_paths`, `edge_types?` | shortest paths with each hop's edge type + rationale clause when present | "How is X connected to Y" — the question embeddings can't answer. |
| `shared_neighbors` | `id_a`, `id_b` | common neighbors ranked by combined edge weight | Triangulation: what sits between two concepts. |
| `expand` | `hits[]` (from any search), `hops`, `edge_types?` | the input hits + their hop-neighbors, fused-scored | The multi-hop composition primitive: `search` → `expand` → rerank is agentic query decomposition without bespoke tooling. |

## 6. Graph Analytics Angle
*"The vault about itself — structure as signal."*

| Tool | Params | Returns | Notes |
|---|---|---|---|
| `central_notes` | `metric: pagerank\|degree\|betweenness`, filters, `limit` | ranked notes | PageRank = the vault's load-bearing concepts; betweenness = **bridge notes** joining domains (review-priority: an error there propagates). Degree fallback when PageRank won't converge on disconnected components. |
| `communities` | `algorithm: louvain\|label_prop`, `min_size` | clusters with auto-labels (top TF-IDF terms + hub note) | Emergent topic structure vs. the *intended* tag taxonomy — the Curator's monthly taxonomy review diffs these two. |
| `orphans` | filters | notes with no in/out edges + age | Curator weekly-audit input, exposed to all agents. |
| `broken_links` | `folder?` | unresolved links with source + line | Must return empty for curated folders — a nonempty result *is* an incident. |
| `suggest_links` | `min_similarity`, `exclude_linked: true`, `limit` | semantically-similar-but-unlinked note pairs, scored | Latent edges the graph is missing. Suggestions only — becoming real links requires the Curator gate. |
| `concept_gaps` | — | stub hubs (heavily-linked `draft`s), missing-middle pairs, dead-end chains | Structural holes: where the knowledge system is thinnest. |
| `vault_stats` | filters | counts, words, link density, tag coverage, type/status/classification histograms | The one-call health panel. |

## 7. Temporal & Audit Angle
*"Git is already our 17a-4 substrate — so time-travel is a first-class read."*

This is where this vault leaves every generic Obsidian server behind: the audit-trail architecture makes the *history* a queryable dimension, not just a compliance artifact.

| Tool | Params | Returns | Notes |
|---|---|---|---|
| `note_history` | `id`, `limit` | per-accepted-mutation: commit sha, timestamp, proposer, Curator verb, gate summary, word/link delta | The per-record regulated history, parsed from the structured commit contract. |
| `record_as_of` | `id`, `timestamp\|sha` | the note **exactly as it existed then** | `git show` behind a tool. This is the regulator-production tool: "show me this record as of March 3" is one call. |
| `vault_diff` | `since`, `until?`, filters | created/modified/archived/redacted notes; link-graph delta | What changed, structurally, in a window. |
| `recent` | `since`, filters, `limit` | recently modified, with mutation verbs | |
| `attention` | `window`, `bucket: day\|week`, `group_by: tag\|folder\|entity` | edit-volume timeseries with trend flags | Where organizational attention is flowing — knowledge velocity by domain. |
| `audit_query` | `verb?`, `proposer?`, `id?`, `since`, `until` | matching audit-log entries (from `00-system/audit/`), joined to commits | The audit trail as a database. Refusals/rejections are entries too — queryable governance. |
| `provenance` | `id` or `id#chunk` | the claim's chain: note → `source` edges → source records → `doc_hash` + ingest metadata → acceptance commit | One call from "the vault says X" to "here is the frozen evidence and its integrity hash." The GLBA/SEC examiner's favorite tool, and the Primary agent's fact-checking tool. |

## 8. Compliance Register Angle
*"The regulatory posture as structured reads."*

| Tool | Params | Returns | Notes |
|---|---|---|---|
| `retention_register` | filters | all `record_class ≠ none` notes: class, classification, `retention_until`, `legal_hold`, age | The living GLBA data inventory / 17a-4 retention worklist. |
| `disposal_docket` | `as_of?` | notes past retention, not held — the exact set awaiting human-authorized disposal | Read-only view of what the Curator's monthly sweep will table. |
| `hold_set` | `hold_ref?` | everything under legal hold, grouped by hold | |
| `pii_map` | `subject_hint?` | notes flagged `pii`, with entity-hub joins for subject correlation | The GDPR Art. 15/17 discovery primitive the Curator's erasure workflow builds on. Clearance-gated at `restricted`. |
| `schema_drift` | — | notes violating the constitution: missing/mistyped properties, unregistered tags, empty summaries past draft, unresolved curated links | The machine-checkable health of the contract itself. Empty is the only acceptable steady state. |

## 9. Work-State Angle (Kanban & Tasks)

| Tool | Params | Returns | Notes |
|---|---|---|---|
| `board` | `base?: kanban-board` | columns → cards with `{id, title, summary, priority, due, project, order}` | Sugar over `query_base` for the canonical board — agents answer "what am I working on" from the same definition humans see. |
| `task_query` | `status?`, `project?`, `due_before?`, `priority_max?`, `stale_days?` | matching cards | Triage-shaped: "blocked >14 days", "due this week for [[X]]". |

## 10. Curator Gate (the *one* write door, exposed as reads-about-writes)

Defined fully in `curator-plugin-spec.md`; listed here because primary agents discover it on the same server:

| Tool | Nature | Purpose |
|---|---|---|
| `curator_propose` | **the only non-read tool** | Submit a mutation proposal (diff/file/instruction) into the gate. Returns `proposal_id`. |
| `curator_status` | read | Gate verdict + violation list + counter-proposal for a `proposal_id`. |
| `curator_report` | read | Latest drain/audit/sweep reports. |

---

## 11. Angle → Question Routing Map (agent guidance, embedded in tool descriptions)

| The caller's question shape | First tool | Then |
|---|---|---|
| "the note about X" (they'd recognize it) | `resolve` | `read_note` |
| exact term / identifier / error string | `fts_search` | |
| concept, paraphrase, "anything on…" | `search` (hybrid, auto) | `expand` if thin |
| "answer this from the vault" | `answer_context` | |
| "how do X and Y relate" / "why" | `path_between`, `shared_neighbors` | `read_section` on hops |
| "what's around this note" | `neighborhood` | |
| "what changed / when / who" | `vault_diff`, `note_history`, `audit_query` | `record_as_of` |
| "prove it / what's the evidence" | `provenance` | `get_attachment` |
| structured predicate over metadata | `property_query` / `query_base` | |
| board / work state | `board`, `task_query` | |
| vault health / structure | `vault_stats`, `schema_drift`, `orphans`, `communities` | |
| "does the vault already have this?" | `similar_to_text` | `curator_propose` if not |

## 12. C# Plugin Parity Matrix

The in-app plugin implements angles 1–6 and 9 natively against the shared index (identical semantics, same envelope minus MCP framing), surfaces 7–8 via the git/audit reader when the vault is a repo, and renders the `why` fusion provenance in its result UI. Tool-name parity is intentional: a query workflow developed against MCP transplants to the in-app surface unchanged. Angle 10 is *not* in the C# plugin — humans mutate through Obsidian + Curator workflow, not through the search UI.

## 13. Implementation Notes

- **Store:** SQLite (FTS5 + sqlite-vec) + in-memory graphology-style graph rebuilt incrementally on commit; embeddings via local ONNX model; cross-encoder rerank local. All proven at vault scale by the surveyed servers.
- **Incremental indexing:** mtime+content-hash keyed; the Curator's post-accept hook triggers targeted re-index; nightly full pass; GDPR redactions force full pass.
- **Chunking:** heading-aware recursive, code/table-block preserving, `parent/child/sibling/sequential` chunk metadata retained for context stitching in `answer_context`.
- **Budgets:** every tool has result caps and byte caps; `neighborhood` depth ≤3; `answer_context` respects `budget_tokens` strictly. Context discipline is a feature.
- **Testing:** the constitution's §3 property registry and §6 index contract are the parser's fixture set; each tool ships a contract doc (the obsidian-mcp-pro / marwansaab pattern of per-tool I/O contracts) so "catalog advertises more than runtime serves" can never happen silently.
