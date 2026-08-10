---
name: vault-query
description: Answer questions from the vault using the right retrieval tool for the
  question shape. Use when the user asks what the vault knows, searches for notes,
  asks about history/evidence/board state, or any vault read.
---
# Vault Query

Session opener: `get_vault_guide` once — it returns the schema constitution, tag
registry, and the live routing map.

Route by question shape (full table in the plugin's `vault-retrieval` skill; the
guide embeds it too):

- **Known note** → `resolve` → `read_note` (prefer `read_section` when one section answers)
- **Exact term/id** → `fts_search` · **concept/paraphrase** → `search` → `expand` if thin
- **"answer from the vault"** → `answer_context` (budgeted, cited)
- **relationships/why** → `path_between` / `shared_neighbors` / `neighborhood`
- **history/who/when** → `note_history` / `vault_diff` / `record_as_of` / `audit_query`
- **evidence** → `provenance` (then `get_attachment`)
- **metadata predicates** → `property_query` / `query_base` · **board** → `board` / `task_query`
- **health** → `vault_stats` / `schema_drift` / `orphans`
- **"already known?"** → `similar_to_text` before any capture/propose

Envelope discipline: `status: degraded` explains itself — relay, don't retry.
`redacted: true` = exists above your clearance: acknowledge existence, never guess
content. Cite `id#chunk_ref` from `answer_context` spans when quoting.
