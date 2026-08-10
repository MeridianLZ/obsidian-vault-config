---
name: promote-capture
description: Promote a single captured note from 01-inbox/ or a daily's Capture section
  into the curated corpus — stamp full schema, sweep aliases, create entity hubs, link
  first mentions. Use when promoting one capture, or as the per-item sub-procedure of
  the daily drain.
---
# Promote Capture

The single-note promotion sub-procedure (invoked by daily-drain; usable standalone).

1. **Stamp schema**: assign ULID `id`, all §3.1 universal + §3.2 compliance properties.
   `summary` must be 1–3 sentences, self-contained (readable with zero context — it is
   the dense-embedding anchor). `origin` per actual authorship.
2. **Alias sweep**: scan the body for acronyms/synonyms/short names actually used;
   add each to `aliases`.
3. **Entity hubs**: every person, org, system, regulation, project mentioned gets exactly
   one `50-entities/` hub — create missing hubs as part of the same transaction.
4. **First-mention linking**: link the first mention of every concept that has (or
   deserves) a note; later mentions stay unlinked. Link canonical names; pipe display
   text is fine.
5. **`## Related` section**: every entry carries a dash-clause stating WHY the edge
   exists.
6. **Dedup check before create**: `similar_to_text` + title/alias search. Near-duplicate
   ⇒ merge into the canonical note instead (authority control), never a second note.
7. Route the result through the full gate (gate-mutation skill) — promotion IS a gated
   mutation: one commit, one audit line.
