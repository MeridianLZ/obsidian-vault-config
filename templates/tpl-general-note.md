# Template: General Note (`tpl-general-note.md`)

**Engine:** core Templates (no Templater — nothing here needs computation).
**Role:** the atomic knowledge note for `10-notes/` — the corpus core, and the template most responsible for retrieval quality. Its structure *is* the chunking, embedding, and hop-expansion strategy made concrete.

**Install:** save the block below as `00-system/templates/tpl-general-note.md`.

---

```markdown
---
type: note
id: "{{date:YYYYMMDDHHmmss}}-{{title}}"
summary: ""
aliases: []
tags: []
created: {{date:YYYY-MM-DD}}T{{time:HH:mm:ss}}
modified: {{date:YYYY-MM-DD}}T{{time:HH:mm:ss}}
status: draft
origin: human
classification: internal
record_class: none
legal_hold: false
pii: false
up: []
related: []
source: []
---

# {{title}}

<!-- Opening paragraph = the answer. State the core claim/conclusion in 2-4
     self-contained sentences, then copy its distillation into `summary`.
     A reader (or retriever) who stops here should leave correct. -->

## Detail

<!-- Body sections. Each `##` heading becomes a retrieval chunk prefixed with
     its heading path — so make headings self-describing out of context:
     "Cutoff Times for Same-Day Wires", not "Details" or "More". -->

## Open questions

- 

## Related

<!-- One line per meaningful neighbor, WITH the reason for the edge.
     These rationale clauses are the multi-hop gold — they tell the
     retriever (and the LLM) why traversal is worth it. -->

- [[]] — 
```

---

## Authoring rules (enforced by Curator lint)

1. **Atomicity.** One claim-cluster per note. If a `## Detail` section grows its own identity, it becomes its own note with an `up` link back. Atomic notes chunk cleanly, embed sharply, and accumulate precise backlinks; sprawling notes do none of these.
2. **`summary` is mandatory before `status: active`.** Self-contained, present tense, no pronouns referring outside the note, no "this note describes…" throat-clearing. It is the primary embedding and the snippet every consumer shows.
3. **Aliases aggressively.** Every acronym, abbreviation, legacy system name, and colloquialism people actually say goes in `aliases`. Sparse retrieval lives and dies here — "the vault knows we call it *Nacha rules*" is an alias entry, not a hope.
4. **Answer-first prose.** Conclusion → evidence → nuance, per note and per section. Retrieval reads tops of chunks; so do humans.
5. **Link on first mention, canonical target, pipe for display** (initial-state spec §5).
6. **Claims carry `source` links** to `40-sources/` records. The Curator flags sourced-claim-free notes as `unverified` — in a regulated environment, provenance is not optional.
7. **`## Related` rationale clauses are required**, not decorative. An unexplained link is a lint warning.
8. **Tags from the registry only** (`#domain/…`, `#kind/…`, `#audience/…`), max 5 per note. Tags filter; links connect; properties describe. Don't cross the streams.
9. **Compliance triage at creation:** touching customer data ⇒ `pii: true` + `record_class: glba-npi` (and/or `gdpr-personal`) + `classification: confidential` minimum. When unsure, over-classify and let the Curator relax it — never the reverse.
```
