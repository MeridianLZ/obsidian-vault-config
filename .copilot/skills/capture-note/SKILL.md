---
name: capture-note
description: Capture new knowledge into the vault's quarantine zone (01-inbox/) with
  capture-grade frontmatter — the primary agent's ONLY direct write path for new
  content. Use when the user says "capture", "note this down", "add to the vault",
  or shares knowledge worth keeping.
---
# Capture Note

01-inbox/ is the free-write quarantine zone: excluded from the retrieval index until
the Curator promotes. Write here directly (the fence allows it); never write curated
folders directly (the fence denies it).

1. **Dedup pre-check** (30 seconds, saves the Curator a rejection): `similar_to_text`
   with the capture's gist. Strong match ⇒ tell the user the vault already knows this
   and offer `propose-mutation` (an update to the canonical note) instead.
2. **Write** `01-inbox/<kebab-slug>.md`:

   ```markdown
   ---
   type: note
   summary: <1–3 self-contained sentences — write these carefully; they survive promotion>
   aliases: [<acronyms/synonyms actually used>]
   tags: []
   created: <ISO now>
   origin: <human|agent|hybrid — agent if you authored, hybrid if co-written>
   classification: <best guess — customer/NPI content is never below confidential>
   pii: <true if any personal data — when unsure, true>
   source: <where this came from, as text — the Curator formalizes evidence links>
   ---
   <body — atomic: one claim-cluster; wikilink first mentions of known concepts>
   ```

   No `id` — the Curator assigns the ULID at promotion. Don't invent registry tags;
   leave `tags: []` and mention candidates in the body.
3. **Tell the user**: captured to inbox; the daily drain promotes it through the gate.
   Urgent promotion ⇒ `propose-mutation` now.
