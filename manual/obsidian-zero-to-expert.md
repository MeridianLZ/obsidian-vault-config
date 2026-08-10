# Obsidian Zero-to-Expert: The Operator's Manual

**For:** a from-scratch, blank vault at an air-gapped financial institution
**Companion documents:** `00-vault-initial-state.md` (the schema constitution — this manual implements it), the three templates, `kanban-board.base`, the two `copilot-instructions` files, and `curator.agent.md`.
**Reading contract:** Parts I–III make you functional (day one). Parts IV–VI make you fluent (week one). Parts VII–IX make you the expert who runs the system (month one).

---

# Part I — The Mental Model (read this even if you skip everything else)

Obsidian is a Markdown editor over a folder of plain-text files. That's the whole product. Everything else — graph view, backlinks, properties, Bases, plugins — is a *lens* over files you own outright. This is why it suits a regulated, air-gapped deployment: there is no cloud, no proprietary database, no vendor in the read path. Your records are `.md` files; your audit trail is git; your views are declarative files sitting next to the notes they describe.

Four primitives carry the entire system:

**1. Notes** are Markdown files. One idea per file (atomicity) — this is a retrieval decision, not an aesthetic one: atomic notes chunk cleanly for embeddings, take precise backlinks, and answer queries without dragging irrelevant text into context.

**2. Properties** (YAML frontmatter between `---` fences at the top of a file) are typed metadata: text, lists, numbers, checkboxes, dates. Obsidian renders them as a structured form; Bases queries them like database columns; our retrieval pipeline reads them as an index contract. In this vault, properties are *governed* — the legal set is defined in the initial-state spec §3 and stamped by templates. You never freehand frontmatter.

**3. Links** (`[[Note Name]]`) are first-class edges. Obsidian resolves them, tracks them when files rename, and computes **backlinks** (who points at me) automatically. Links are how multi-hop retrieval works: embeddings find *similar* text, links find *logically connected* text that isn't textually similar. Every link you place is a query you'll be able to answer later.

**4. Tags** (`#domain/payments/ach`) are cheap cross-cutting facets. In this vault they come from a controlled registry — a tag is a promise that the term means one thing everywhere.

The division of labor, memorize it: **properties describe, links connect, tags facet, folders stage lifecycle.** Folders are *not* topics here (topic hierarchies rot; the link graph doesn't) — `10-notes/` vs `01-inbox/` tells you a note's trust level, not its subject.

One more actor: nothing enters the curated corpus except through the **Curator agent**. You and the Primary agent capture freely into the inbox and daily notes; the Curator gates promotion, enforces schema, and writes the audit trail. Think of the vault as having a hot side (capture, messy, yours) and a cold side (curated, indexed, regulated) with exactly one door between them.

---

# Part II — Installation & Air-Gapped Setup

## 2.1 Getting Obsidian in

On a connected staging machine, download the official Obsidian installer for your OS from obsidian.md, plus the release files (`main.js`, `manifest.json`, `styles.css`) for each pinned community plugin (§3.4 list). Transfer via your approved media process. Verify checksums against the staging manifest on both sides of the gap. Obsidian itself phones home only for update checks and sync/publish — all disabled below — and runs fully offline.

## 2.2 Host hardening (compliance floor)

- Full-disk encryption on (GLBA Safeguards encryption-at-rest control; note it in your written infosec program).
- Vault directory permissions restricted to the operator group that maps to `classification: internal` clearance; `restricted` material implies a separate ACL story documented by your infosec program — the vault's `classification` property is the *label*, the OS/repo ACL is the *enforcement*.
- OS-level backup of the vault directory is redundant with, not a substitute for, the git duplicate-copy arrangement in Part VII.

## 2.3 First launch

Launch → **Create new vault** → name it, point it at your encrypted volume → Open. You get an empty folder plus a hidden `.obsidian/` config directory. Then immediately, in **Settings**:

- **General:** turn *off* "Automatic updates" (change control applies to the editor too).
- **Editor:** defaults are fine; enable "Show line numbers" if you like living correctly.
- **Files & links:** "Default location for new notes" → *In the folder specified below* → `01-inbox`. "New link format" → *Shortest path when possible*. "Use [[Wikilinks]]" → on. "Detect all file extensions" → on. "Attachment folder path" → `40-sources/_assets`.
- **Appearance:** to taste; no CSS snippets at initial state (they're schema-adjacent — add via change control).
- **Core plugins:** enable Templates, Daily notes, Bases, Backlinks, Outgoing links, Tags view, Properties view, Search, Quick switcher, Command palette, File recovery. Disable Sync and Publish.

## 2.4 Build the skeleton

Create the folder tree exactly as the initial-state spec §2 defines (`00-system/` through `90-archive/`, including `00-system/templates`, `00-system/bases`, `00-system/schema`, `00-system/audit`, `01-inbox/_proposals`). Copy in: the initial-state spec (→ `00-system/schema/`), the three template files (→ `00-system/templates/`), `kanban-board.base` (→ `00-system/bases/`), and seed `00-system/schema/tag-registry.md` with the three root namespaces and an empty `00-system/schema/schema-changelog.md`.

## 2.5 Wire the core plugins

- **Settings → Templates:** Template folder location → `00-system/templates`. Date format `YYYY-MM-DD`, time format `HH:mm:ss` (the kanban and general templates' `{{date}}`/`{{time}}` variables depend on these).
- **Settings → Daily notes:** New file location → `30-daily`. Date format → `YYYY-MM-DD`. Template file location → `00-system/templates/tpl-daily-note`. "Open daily note on startup" → on.

## 2.6 Offline plugin install

For each pinned plugin (Templater; the Bases kanban view; obsidian-git; your C# hybrid-search plugin build): create `.obsidian/plugins/<plugin-id>/`, drop in `main.js` + `manifest.json` (+ `styles.css` where shipped), restart Obsidian, then Settings → Community plugins → turn off *Restricted mode* → enable each. Record versions in the schema changelog. **Templater settings:** Template folder → `00-system/templates`; enable *Trigger Templater on new file creation* (this is what makes the daily template fire automatically). **Kanban view settings:** point its new-card template at `tpl-kanban-card.md` and new-card folder at `20-tasks` if your build configures this in-plugin rather than in the `.base`.

Smoke test (initial-state spec §8): create one note from each template, confirm the Properties view renders every field with the right *type* (dates as dates, lists as lists — if a property renders as plain text, the template's YAML is malformed), open `kanban-board.base` and confirm the test card appears in `backlog`, drag it to `todo` and watch its `status` frontmatter change. Delete the test notes. You are at schema-complete zero.

---

# Part III — Foundations Fluency

## 3.1 Markdown that matters here

Headings `#`–`######`, bold/italic, `- ` lists, `- [ ]` checkboxes, fenced code blocks, `> ` quotes, tables. Two vault-specific disciplines: **(1)** `##` headings are chunk boundaries for the retrieval pipeline — write them self-describing ("Cutoff Times for Same-Day Wires", never "Details"); **(2)** the first paragraph of every note is the answer, front-loaded, because that's what tops the chunk and what humans skim.

## 3.2 Properties in practice

Click a property name to rename vault-wide (don't — schema is governed); click a value to edit with type-aware widgets. `Ctrl/Cmd-;` jumps focus to properties. The **Properties view** core plugin (left sidebar) shows every property in the vault with usage counts — your first drift-detection tool: if you ever see `Status` and `status` coexisting, someone freehanded frontmatter and the Curator's lint missed it (file it).

Property types are inferred from first use and remembered vault-wide. Our templates establish them on day one; the smoke test in 2.6 is what locks them in correctly.

## 3.3 Links, embeds, backlinks

`[[` opens the link autocomplete — it searches filenames *and* aliases, which is why the alias discipline in the general-note template pays off immediately. `[[Note|display text]]` pipes display. `[[Note#Heading]]` links a section; `[[Note#^blockid]]` links a block (type `^` at a line's end to mint an id). `![[Note]]` *embeds* (transcludes) — use sparingly in curated notes; an embed is a dependency.

The **Backlinks pane** (right sidebar, or "Backlinks in document" at note bottom) shows *linked mentions* (real links) and *unlinked mentions* (plain-text occurrences of the note's name/aliases). Unlinked mentions are a curation goldmine: the Curator's promotion pass converts the worthy ones into real links.

## 3.4 Search like you mean it

Obsidian search (`Ctrl/Cmd-Shift-F`) operators you'll actually use:

```
tag:#domain/payments          notes carrying the tag
path:"10-notes"               scope to the curated corpus
file:2026-08                  filename match (daily notes by month)
["classification":restricted]  property match
["status":draft]              lifecycle queries
line:(wire cutoff)            both terms on one line
/regex/                       when you must
-path:"90-archive"            exclusion
```

Combine freely: `["type":note] ["status":stale] -tag:#kind/procedure`. Save any search as a bookmark. This is your zero-dependency query layer; Bases (Part V) is the structured one; the hybrid-search plugin (Part VIII) is the semantic one. Expert habit: know which of the three a question calls for before typing.

## 3.5 The graph, briefly

Graph view is diagnostic, not navigational: open it filtered to `path:10-notes` weekly and look for islands (under-linked clusters) and hairballs (a note doing too many jobs — split candidate). Local graph (per-note, depth 2) is the honest version of "what would multi-hop retrieval see from here."

---

# Part IV — The Daily Operating Rhythm

**Morning.** Obsidian opens today's daily note (auto-created from the template, nav links to yesterday/tomorrow already computed). Fill `## Focus` — one to three items, linked to their task cards or notes.

**All day.** Capture into `## Capture` and `## Log`. This is the *hot side*: link promiscuously, including to notes that don't exist yet (the only place that's legal). A thought worth more than a line goes to `01-inbox/` as its own note — quick switcher `Ctrl/Cmd-O`, type a title, write, move on; no frontmatter ceremony required on the hot side, the Curator stamps schema at promotion.

**Decisions are sacred.** Anything decided goes under `## Decisions` in the moment. Decision notes (`#kind/decision`) are the highest-value retrieval targets this system produces — six months from now, "why did we do X" is the query, and this is where its answer is born.

**End of day.** Fill `Done / Carried / Noticed`, then invoke the Curator's daily drain (Part VI): it triages your capture into curated notes, cards, entity stubs, or logged discards, and closes the daily.

**Weekly.** Skim the board's *triage* table view, the Curator's orphan/staleness report, and the graph. Twenty minutes; the system stays honest.

---

# Part V — Bases: Your Database Layer

Bases turns frontmatter into queryable data with zero external dependencies. A `.base` file is declarative YAML defining **filters** (which notes), **formulas** (computed columns), **properties** (display config), and **views** (table, cards, list — plus kanban via our view plugin). Open a `.base` like a note; it renders live. You can also embed a base in any note with `![[kanban-board.base]]` or a code block — the board on demand inside a project note.

## 5.1 Syntax you'll use daily

```yaml
filters:
  and:
    - type == "task"                      # property comparison
    - status != "done"
    - file.inFolder("20-tasks")           # file functions
    - '!summary.isEmpty()'                # quoted when starting with !
formulas:
  age_days: (now() - created).days        # date arithmetic
  is_overdue: due && due < now()          # boolean formula
views:
  - type: table
    name: Triage
    filters:                              # view-level filters stack on global
      and:
        - priority <= 2
    order: [priority, due]
    properties: [file.name, status, due, formula.age_days]
```

Filter functions worth memorizing: `taggedWith(file, "#domain/payments")`, `linksTo(file, [[Some Entity]])` for graph-aware views, `contains()`, `.isEmpty()`, date comparisons against `now()` and `date("2026-01-01")`. `this` refers to the file embedding the base — which enables one generic base reused everywhere:

```yaml
filters:
  and:
    - type == "task"
    - project == this.file.asLink()
```

Embed that in any project entity note and it shows *that project's* cards. One file, every project dashboard.

## 5.2 The kanban board

`00-system/bases/kanban-board.base` (shipped) filters to open task notes and renders the kanban view grouped by `status` with columns `backlog → todo → doing → blocked → review`. Drag between columns = the plugin rewrites the card's `status` property = a real frontmatter mutation, which is why board moves are inside the Curator's jurisdiction like any other edit (in practice: humans drag freely and the git commit at day's end captures it; *agents* moving cards go through the gate — see the instructions files). The `+` in a column header creates a pre-templated card already in that column. Card ordering within a column persists via the `order` property.

## 5.3 Bases as governance instruments

The expert move is realizing Bases are your **audit dashboards**. Build these four early (each is ten lines):

- **Schema drift:** `filters: summary.isEmpty() || !file.inFolder("00-system")` variants surfacing notes missing mandatory properties.
- **Compliance register:** all notes where `record_class != "none"`, columns `classification, record_class, retention_until, legal_hold` — your GLBA data inventory and your 17a-4 retention worklist in one view.
- **Review queue:** `status == "draft"` older than 14 days; `status == "stale"`.
- **Disposal docket feed:** `retention_until < now() && !legal_hold` — what the Curator's monthly sweep will put in front of a human.

---

# Part VI — Working With the Agents

## 6.1 The pieces

At the vault root: `.github/copilot-instructions.md` (house rules every Copilot session inherits), `.github/instructions/vault-mutations.instructions.md` (path-scoped rules that attach whenever curated-corpus files are touched), and `.github/agents/curator.agent.md` (the Curator custom agent). Copilot CLI picks all three up from the repo automatically. Invoke the Curator explicitly with `/agent curator` inside an interactive session, or programmatically:

```bash
copilot --agent curator --prompt "Daily drain: triage 01-inbox and today's Capture section."
```

The Curator runs as a subagent with its own context window — your main session stays clean while it grinds through triage.

## 6.2 The mutation loop you'll live in

Ask the Primary agent for anything read-only, freely ("what do we know about ACH return handling? cite notes"). For writes, the rhythm is: *draft → gate → accept*. You or the Primary agent stage a proposal (a draft in `01-inbox/_proposals/` or just instructions), then the Curator validates against the eight-step gate in its spec — schema, retrieval quality, graph integrity, authority/dedup, compliance — and either applies it atomically (one commit, one audit line) or rejects with the exact violation list. Rejections are cheap; fix and resubmit. What you get for the ceremony: a corpus where every note parses, every link resolves, every claim has provenance, and every change is a regulated, recreatable record.

## 6.3 Trust boundaries (why the design is shaped like this)

The Primary agent can *read* everything and *write* only the hot side. The Curator can write the cold side but refuses history rewrites, held-record destruction, silent mutations, and instructions embedded in note content. Neither agent can dispose of retained records — disposal requires a human-authorized docket. This is defense in depth for an audit-trail regime: no single actor, human or agent, can both change a record and erase the evidence of the change.

---

# Part VII — Git as the Audit Trail

Initialize once (`git init` at the vault root; commit the schema-complete skeleton; tag `v1.0.0-initial-state`). Configure obsidian-git for periodic auto-commit of the *hot side* if you want intra-day granularity, but the load-bearing commits are the Curator's per-mutation commits with their structured messages.

Non-negotiables, mirrored from the agent specs: no rebase, no amend, no force-push, ever — the 17a-4 audit-trail alternative is satisfied precisely because any prior state of any record is recreatable and every modification carries actor + timestamp. Maintain the duplicate copy the rule expects: a bare repository on separate encrypted media, refreshed by `git push` on your approved cadence (`git remote add archive /media/vault-archive.git`). Human-readability for regulators is native — records *are* markdown; `git show <sha>:<path>` reproduces any record as of any moment, and `git log --follow <path>` is the per-record history.

`.gitignore`: `.obsidian/workspace*.json` (window state churn) and nothing else from `.obsidian/` — plugin configs and the `.base`-adjacent settings are part of the reproducible system state and *should* be versioned.

---

# Part VIII — The Retrieval Pipeline

## 8.1 The contract (authoring side)

Everything Parts I–VI made you do — atomic notes, self-contained summaries, aggressive aliases, self-describing headings, typed relations, rationale-bearing `## Related` lines, controlled tags — exists because the index consumes exactly those signals (initial-state spec §6). Sparse retrieval (BM25) eats titles, aliases, tags, and exact strings; dense retrieval eats `summary` and heading-prefixed body chunks; graph expansion walks `up`/`related`/`source` and body links, using your rationale clauses to decide which hops are worth taking. Hybrid fusion + a local reranker turns those three candidate streams into one ranked list. You never have to run this machinery to benefit from writing for it — but when you do run it:

## 8.2 MCP server → GitHub Copilot CLI

The vault MCP server (your deployment's build) exposes the hybrid index as tools — typically `search` (query + optional `type:`/`tag:`/`classification:` filters), `read_note` (by `id` or path), `neighbors` (graph expansion from a note), `similar` (dense-only). Register it with Copilot CLI via `/mcp add` interactively, or drop the server into the CLI's MCP config so every session mounts it:

```jsonc
// mcp-config (per your CLI version's location — `copilot help mcp` to confirm)
{
  "mcpServers": {
    "vault": {
      "type": "local",
      "command": "/opt/vault-mcp/vault-mcp",       // stdio binary, air-gap safe
      "args": ["--vault", "/data/vault", "--readonly"],
      "tools": ["search", "read_note", "neighbors", "similar"]
    }
  }
}
```

Run it stdio/local — no ports, no network, consistent with the air gap. Grant the *Curator* agent a non-readonly variant only if your deployment routes mutations through MCP rather than direct file edits; otherwise readonly everywhere and let file-level gating stand. The `classification` filter must be enforced server-side against the session's clearance — never trust the model to self-censor.

## 8.3 C# hybrid-search plugin (in-app retrieval)

The standalone C# engine indexes the same contract from inside Obsidian: frontmatter parsed as the typed schema, chunking on `##` with heading-path prefixes, `id`-keyed chunks (rename-stable), exclusions honored (`01-inbox/`, `00-system/`, drafts, and `pii: true` bodies per policy — summary-only for those). Embeddings come from a local model on-box; nothing leaves the machine. Re-index triggers: on Curator commit (hook) plus a nightly full pass; after any GDPR redaction, force the full pass so dropped chunks actually drop. If you're building the plugin against this spec: treat `00-vault-initial-state.md` §3 and §6 as the parser's unit-test fixtures.

## 8.4 Query craft (the expert's habit)

Three retrieval layers, three question shapes. *"Where's the note I half-remember"* → Obsidian search/quick switcher (sparse, instant). *"Which notes satisfy structured conditions"* → a Base. *"What does the vault know about X / why / what's connected"* → hybrid search via the plugin or the Primary agent over MCP, and for multi-hop questions ask the agent to decompose ("find the decision, then what it superseded, then the source filings behind both") — the graph layer is built for exactly that traversal.

---

# Part IX — Running the System (Maintenance, Compliance, Mastery)

## 9.1 Cadence (delegate the grind, keep the judgment)

| Rhythm | Who | What |
|---|---|---|
| Daily | Curator (you invoke) | Inbox + daily-capture drain; close the daily |
| Weekly | Curator report → you | Orphans, stale drafts, unresolved-link scan, board hygiene |
| Monthly | Curator + human | Taxonomy review; retention sweep → disposal docket → human sign-off; retrieval-contract audit sample |
| Quarterly | Human | Schema changelog review; plugin version review; restore-drill from the archive repo (`git clone` the bare copy, open in Obsidian, verify) |

## 9.2 Compliance operations, end-to-end

**GDPR erasure request:** hand the Curator the subject identifiers → it maps every occurrence via search + entity-hub backlinks → partitions by `record_class` → redacts what's redactable via forward commits, refuses (and logs, with Art. 17(3)(b) basis) what retention law protects → you trigger re-index → the audit note in `00-system/audit/` plus the commit set *is* your accountability record. **Legal hold:** flip `legal_hold: true` on the affected set (a gated bulk operation with enumerated files); every destructive path in the system now refuses automatically. **Regulator production:** scope with a Base or search over `record_class`/date, export as markdown (already human-readable), include `git log` extracts for the audit-trail showing.

## 9.3 The expert bar

You're the expert when: you can predict from any prospective query *which* signal will retrieve it, and you author to that; your board, compliance register, and review queue are Bases you wrote yourself; a schema change goes proposal → ratification → migration → changelog without you re-reading the constitution; a regulator's "show me this record's history" is a two-command answer; and the Curator rejects something of yours and you're *glad*, because the gate holding against its own operators is the whole point.

## 9.4 Failure modes to never grow

Topic folders creeping back (lifecycle folders only). Properties freehanded outside templates. Tags minted ad hoc. Summaries written as "This note is about…" filler. Links without rationale in curated notes. A "quick fix" applied past the Curator "just this once." Any git history edit for any reason. Each of these is individually small and cumulatively fatal — the drift audits in 9.1 exist because entropy doesn't announce itself.

---

*End of manual. The constitution outranks it; the Curator enforces both.*
