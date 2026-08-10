# Vault Initial State Specification

**Version:** 1.0.0 · **Status:** ratified · **Applies to:** the entire vault from first commit
**Audience:** vault operators, the Primary agent, the Curator agent, and the retrieval pipeline (MCP server + C# hybrid-search plugin)

This document is the **schema constitution** of the vault. Every note, template, agent, and retrieval component defers to it. Changes to this file are themselves Curator-gated mutations (see §9).

---

## 1. Design Goals

1. **Retrieval-first.** Every structural decision maximizes signal for three retrieval modes:
   - **Sparse (BM25/FTS):** exact identifiers, aliases, tags, headings.
   - **Dense (semantic/vector):** self-contained summaries, atomic scope, low-noise prose.
   - **Graph (multi-hop):** typed wikilinks with stated rationale, backlink density, hierarchy properties.
2. **Compliance-native.** GLBA, SEC Rule 17a-4 (audit-trail alternative), and GDPR obligations are encoded as *properties on every note*, not as an afterthought process.
3. **Agent-governable.** The schema is machine-checkable so the Curator can lint, gate, and audit every mutation deterministically.
4. **Air-gap survivable.** No feature depends on network access, cloud sync, or online plugin registries. Everything is plain files.
5. **Minimal.** No property, tag, folder, or plugin exists without a named consumer. If nothing reads it, it is removed.

---

## 2. Folder Layout

Folders encode **lifecycle and authorship**, not topic. Topics are expressed through links and tags (topic-folders rot; link graphs don't).

```
vault/
├── 00-system/                 # Vault machinery — never ingested as knowledge
│   ├── templates/             #   Core-Templates + Templater template files
│   ├── bases/                 #   .base view definitions (kanban, registries, audits)
│   ├── schema/                #   THIS file + taxonomy registry + changelog
│   └── audit/                 #   Curator audit log notes (append-only)
├── 01-inbox/                  # Untriaged capture. Quarantine zone — excluded from
│                              #   embedding index until Curator promotes
├── 10-notes/                  # Atomic knowledge notes (the corpus core)
├── 20-tasks/                  # Kanban cards — one note per card
├── 30-daily/                  # Daily notes (YYYY-MM-DD.md)
├── 40-sources/                # Source/reference records (docs, filings, policies)
│                              #   Immutable after Curator acceptance
├── 50-entities/               # People, orgs, systems, regulations (link hubs)
└── 90-archive/                # Retired notes. Never deleted while under retention
```

**Rules:**
- New knowledge lands in `01-inbox/` or `30-daily/` only. It reaches `10-notes/`, `40-sources/`, or `50-entities/` exclusively via Curator promotion.
- `40-sources/` content is **evidence**: after acceptance, body text is frozen; only frontmatter (review/retention fields) may change, and only via Curator.
- `90-archive/` preserves the full note with frontmatter intact so retention clocks keep running. Archival is a `status` change + move, never a delete.
- Attachments live in `40-sources/_assets/` with the same retention discipline.

---

## 3. Property Schema Registry

Properties are the typed metadata layer. **Tags never carry data that a property can carry.** Names are `snake_case`, values are Obsidian-native property types (Text, List, Number, Checkbox, Date, Date & time).

### 3.1 Universal properties (every note, no exceptions)

| Property | Type | Required | Purpose / consumer |
|---|---|---|---|
| `type` | Text (enum) | ✔ | Note class. One of: `note`, `task`, `daily`, `source`, `entity`, `system`, `audit`. Drives Bases filters, templates, retrieval routing. |
| `id` | Text | ✔ | Immutable, unique, lexicographically-sortable identifier assigned at creation. Survives renames; the retrieval index and audit log key on it, not the filename. **Format contract:** core-Templates notes mint `<YYYYMMDDHHmmss>-<title-slug>`; Templater notes mint `<epoch-base36><random>` (ULID-lite). Both are sortable and collision-resistant. The Curator MAY normalize an id to canonical form at promotion but MUST preserve it unchanged thereafter — an id, once accepted, is permanent. |
| `summary` | Text | ✔ | 1–3 sentence **self-contained** abstract. Primary dense-embedding anchor; also shown in Bases and MCP result snippets. Must make sense with zero surrounding context. |
| `aliases` | List | ✔ (may be empty) | Synonyms, acronyms, ticker-style short names, misspellings you actually use. Primary sparse-retrieval recall lever. |
| `tags` | List | ✔ (may be empty) | Faceted navigation only — see §4. |
| `created` | Date & time | ✔ | Set once at creation. ISO 8601. |
| `modified` | Date & time | ✔ | Updated on every accepted mutation (Curator responsibility). |
| `status` | Text (enum) | ✔ | Lifecycle per type — see §3.5. |
| `origin` | Text (enum) | ✔ | Authorship provenance for audit-trail reconstruction. Exactly: **`human`** = a person wrote the substantive content; **`agent`** = an agent authored it end-to-end; **`hybrid`** = a person wrote the substance and an agent materially assisted (drafted, restructured, or summarized) OR vice versa — any note where both a human and an agent shaped the content. When in doubt between `agent` and `hybrid`, use `hybrid`. The Curator never silently changes `origin`. |

### 3.2 Compliance properties (every note)

| Property | Type | Required | Purpose |
|---|---|---|---|
| `classification` | Text (enum) | ✔ | `public` · `internal` · `confidential` · `restricted`. GLBA Safeguards access-control driver. The MCP server MUST filter results by the caller's clearance against this field. |
| `record_class` | List (enum values) | ✔ | Regulatory bucket(s), always written as a **list** (`[none]`, `[sec-17a4]`, `[gdpr-personal, glba-npi]`). Values: `none`, `sec-17a4`, `glba-npi`, `gdpr-personal`, `gdpr-special`. **`none` is exclusive** — a note is either `[none]` or a list of one-or-more non-`none` classes, never both. When multiple classes apply, `retention_until` is the **maximum** of their computed dates (longest obligation wins). Derivation rules: `00-system/schema/retention-rules.md`. |
| `retention_until` | Date | when `record_class ≠ [none]` | Earliest lawful disposal date, **derived** per `retention-rules.md` (never guessed). Curator refuses any destructive mutation before this date. |
| `legal_hold` | Checkbox | ✔ (default false) | When true, **all** destructive mutations are refused regardless of dates. Truthy string forms (`"true"`, `"yes"`) are honored as true — never silently read as false. |
| `hold_ref` | Text | when `legal_hold: true` | The hold's reference identifier (matter/ticket), so held records group by hold. Absent on unheld notes. |
| `pii` | Checkbox | ✔ (default false) | Note contains personal data (GDPR Art. 4). Gates GDPR workflows and can exclude note bodies from embedding export if policy requires. Truthy strings honored as true. |

**Regulatory rationale (encoded, not aspirational):**
- **SEC 17a-4 audit-trail alternative.** The 2022 amendments allow, in place of WORM, an electronic recordkeeping system that preserves records so that <cite>an original record can be recreated if it is modified or deleted</cite>, with a complete time-stamped audit trail covering all modifications/deletions, the date/time of operator actions, and the individual responsible. This vault satisfies that via: (a) Git as the recordkeeping substrate — every accepted mutation is a signed commit identifying actor, timestamp, and full diff, permitting bit-exact recreation of any prior state; (b) the Curator's append-only audit log (§9) as the human-readable trail; (c) `retention_until` + `legal_hold` enforcement. Markdown satisfies the human-readable production requirement; the two-most-recent-years accessibility requirement is trivially met since the whole vault is live.
- **GLBA Safeguards Rule.** `classification` + `record_class: glba-npi` implement data inventory and access control; encryption at rest is an OS/disk concern documented in the manual §2.
- **GDPR.** `pii`, `record_class: gdpr-*`, and `retention_until` implement storage limitation and records-of-processing. Erasure requests (Art. 17) are handled by the Curator's redaction protocol; where a note is simultaneously under 17a-4 retention, erasure is lawfully refused under Art. 17(3)(b) (legal obligation) and the refusal is logged. This conflict is resolved *per note* by `record_class`, which is why it is mandatory.

### 3.3 Relation properties (graph layer — `note`, `source`, `entity`, `task`)

| Property | Type | Purpose |
|---|---|---|
| `up` | List of links | Parent concept(s) / broader term. The taxonomic hop for multi-hop traversal ("zoom out"). |
| `related` | List of links | Lateral associations. Every entry SHOULD be mirrored by a `## Related` body line explaining *why* (see §5.3). |
| `source` | List of links | Evidence chain → notes in `40-sources/`. The provenance hop. |
| `verified` | Checkbox | ✔ on `note`/`source` claims (default false) | True when the note's claims trace to at least one `source` link. A curated `note` or `source` with `verified: false` (or no `source` edges) is the machine-queryable "unverified" state the Curator flags — `verified` makes provenance status a first-class filterable property, not just prose. The Curator sets it true only after confirming the source chain; never true without a `source` edge. |

### 3.4 Type-specific properties

**`task` (kanban cards):**

| Property | Type | Notes |
|---|---|---|
| `status` | Text | `backlog` · `todo` · `doing` · `blocked` · `review` · `done` — the Bases kanban `group by` column driver |
| `priority` | Number | 1 (highest) – 4 |
| `due` | Date | optional |
| `project` | Link | parent project entity in `50-entities/` |
| `order` | Number | intra-column sort for the kanban view |

**`daily`:** `date` (Date, = filename date).
**`source`:** `author` (List), `published` (Date), `ingested` (Date), `doc_hash` (Text — SHA-256 of the original artifact for integrity attestation).
**`entity`:** `entity_type` (Text enum, **required on every `type: entity` note**): exactly one of `person` · `org` · `system` · `regulation` · `project`. This is the machine key for entity-hub uniqueness — the Curator enforces one canonical hub per `(entity_type, canonical-name)`. A `person` entity carrying personal data MUST also be `pii: true` and `classification: confidential` or higher.

### 3.5 `status` enums per type

| type | statuses |
|---|---|
| `note` | `draft` → `active` → `stale` → `archived` |
| `task` | `backlog` · `todo` · `doing` · `blocked` · `review` · `done` |
| `source` | `quarantined` → `accepted` → `superseded` |
| `daily` | `open` → `closed` |
| `entity` | `active` · `archived` |

---

## 4. Tag Taxonomy

Tags are **navigational facets only** — cheap, cross-cutting filters. Anything with a value, a date, or a lifecycle is a property instead.

**Namespace rules:**
- Always nested, always lowercase-kebab: `#domain/payments/ach`, never bare `#ach`.
- Maximum depth 3.
- The complete controlled vocabulary lives in `00-system/schema/tag-registry.md`. A tag not in the registry is a Curator lint error; new tags enter via a Curator-approved registry mutation (authority control — see the Curator spec).

**Root namespaces (initial, deliberately small):**

| Root | Purpose | Examples |
|---|---|---|
| `#domain/` | Business/subject matter | `#domain/lending`, `#domain/payments/ach`, `#domain/compliance/aml` |
| `#kind/` | Content genre orthogonal to `type` | `#kind/decision`, `#kind/procedure`, `#kind/definition`, `#kind/postmortem` |
| `#audience/` | Intended reader group | `#audience/engineering`, `#audience/compliance`, `#audience/exec` |

Retrieval note: tags are indexed as sparse features by the C# plugin and are filterable in MCP tool calls (`tag:` operator). Because they are controlled-vocabulary, they behave like reliable categorical filters rather than folksonomy noise.

---

## 5. Link & Backlink Conventions

The link graph is the multi-hop substrate. Embeddings find *similar* text; links find *logically connected* text that is not textually similar. Both retrieval consumers traverse links, so links carry discipline:

### 5.1 Linking rules
1. **Link on first mention** of any concept that has (or deserves) a note. Subsequent mentions in the same note stay unlinked (noise reduction).
2. **Link the canonical name**; use pipe display text freely: `[[SEC Rule 17a-4|17a-4]]`. Aliases in the target's frontmatter make either form resolvable.
3. **No orphan targets.** Linking to a note that doesn't exist yet is allowed *in inbox/daily notes only*; the Curator's promotion pass either creates the stub (as `draft`) or removes the link. The curated corpus (`10-notes/`, `40-sources/`, `50-entities/`) contains zero unresolved links at all times.
4. **Entities are link hubs.** Every person, org, system, regulation, and project mentioned in curated notes has exactly one `50-entities/` note. This gives backlinks a place to accumulate and gives multi-hop queries their pivot points ("everything touching *Reg E* that also involves *the settlement service*" = two hops through entity hubs).

### 5.2 Typed relations
`up` / `related` / `source` (§3.3) are the machine-typed edges. Body wikilinks are untyped edges. The retrieval graph uses both, but typed edges rank higher for hop expansion.

### 5.3 The `## Related` section (edge labels)
Every curated `note` ends with:

```markdown
## Related
- [[Reg E Error-Resolution Timeline]] — constrains the dispute workflow this note describes
- [[ACH Return Codes]] — the upstream signal that triggers this procedure
```

The dash-clause states **why the edge exists**. This is the single highest-leverage multi-hop feature in the vault: hop-expansion retrieval surfaces not just the neighbor but the *reason to traverse*, which the reranker and the LLM both exploit.

### 5.4 Backlink hygiene
- Backlinks are computed, not written — never maintain manual "linked from" lists.
- A curated note with zero backlinks after 30 days is flagged `stale`-candidate by the Curator's orphan audit.

---

## 6. Retrieval Contract (what the index consumes)

Both consumers — the **MCP server** (GitHub Copilot CLI) and the **C# hybrid-search plugin** — index the same contract:

| Signal | Source | Mode |
|---|---|---|
| `summary` property | frontmatter | dense (primary embedding), sparse |
| Body chunks | markdown sections, split on `##`, ~200–400 tokens, heading-path prefixed (`"Wire Recall Procedure > Cutoff Times: …"`) | dense + sparse |
| `title` + `aliases` | frontmatter/filename | sparse + fuzzy |
| `tags`, `type`, `status`, `classification` | frontmatter | filters |
| `up`/`related`/`source` + body wikilinks + `## Related` rationale | frontmatter + body | graph expansion |
| `id` | frontmatter | stable chunk keys, dedupe across renames |

**Index exclusions:** `01-inbox/` (quarantine), `00-system/` (machinery), notes with `status: draft` unless the query opts in, and — per deployment policy — bodies of `pii: true` notes (summary-only indexing is the fallback).

Authoring implication, stated once and enforced by templates: **write summaries as if they will be read with no context, keep notes atomic (one claim-cluster per note), front-load the conclusion, and let headings be self-describing** — because that is literally what the chunker ships to the embedder.

---

## 7. Plugin Baseline (air-gapped)

**Core plugins ON:** Templates, Daily notes, Bases, Backlinks, Outgoing links, Tags, Properties view, Search, Quick switcher, Command palette, File recovery, Templates folder → `00-system/templates/`.
**Core plugins OFF:** Sync, Publish (network), anything unused.

**Community plugins (offline-installed per manual §3.4, versions pinned and vendored in the deployment artifact):**

| Plugin | Why it clears the minimalism bar |
|---|---|
| **Templater** | *Only* for the daily note (prev/next-day navigation and weekday computation are impossible in core Templates). All other templates are core-compatible. This is the one juice-justifies-the-squeeze exception. |
| **Bases kanban view** (e.g., `bases-kanban`) | Renders the note-per-card board; drag-and-drop writes `status` back to frontmatter. |
| **obsidian-git** | The 17a-4 audit-trail substrate. Commits on Curator acceptance; local bare repo as the duplicate-copy target. |
| **(deployment)** C# hybrid-search plugin | The in-app retrieval surface. |

Nothing else at initial state. Every future plugin addition is a Curator-gated schema mutation with a named consumer.

---

## 8. Initial-State Checklist (executable)

1. Create the folder tree of §2 exactly.
2. Copy this file to `00-system/schema/00-vault-initial-state.md`; create empty `tag-registry.md` seeded with §4's roots and `schema-changelog.md`.
3. Copy the four templates from `templates/` into `00-system/templates/`; copy `bases/*.base` into `00-system/bases/`.
4. Configure core plugins per §7 (Daily notes → folder `30-daily`, format `YYYY-MM-DD`, template `tpl-daily-note`; Templates folder → `00-system/templates`).
5. Offline-install the community plugins; pin versions; enable.
6. `git init`, first commit = the empty schema-complete vault, tagged `v1.0.0-initial-state`. This commit is the audit-trail epoch.
7. Register both agents (`.github/copilot-instructions.md`, `.github/instructions/`, `.github/agents/curator.agent.md`) at the vault root.
8. Verify: create a scratch note from each template, confirm properties render typed in the Properties view, confirm the kanban base groups by `status`, delete the scratch notes, commit.

---

## 9. Change Control

The **schema artifacts** are: this spec, the tag registry (`tag-registry.md`), the schema changelog (`schema-changelog.md`), the retention-rules table (`retention-rules.md`), the workflow registry (`workflow-registry.md`), the templates, and the `.base` files — all under `00-system/schema/` or `00-system/bases/` (and `00-system/templates/`). Mutating any of them requires: a written proposal note (`type: system`, `#kind/decision`), Curator review against the criteria in `curator.agent.md`, a changelog entry, and a version bump here. The Curator refuses schema mutations that lack a migration note for existing content.
