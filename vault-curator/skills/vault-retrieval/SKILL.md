---
name: vault-retrieval
description: Query the compliance vault the competent way — the angle→question routing
  map as an executable playbook for PRIMARY agents. Use whenever answering from the
  vault, searching vault content, or deciding which vault-read MCP tool fits a question.
---
# Vault Retrieval Routing

Call `get_vault_guide` once per session first. Then route by question shape — first
tool listed, escalate to "then" only if the first result is thin:

| Question shape | First | Then |
|---|---|---|
| "the note about X" (you'd recognize it) | `resolve` | `read_note` |
| exact term / identifier / error string | `fts_search` | |
| concept, paraphrase, "anything on…" | `search` (mode auto) | `expand` if thin |
| "answer this from the vault" | `answer_context` | |
| "how do X and Y relate" / "why" | `path_between`, `shared_neighbors` | `read_section` on hops |
| "what's around this note" | `neighborhood` | |
| "what changed / when / who" | `vault_diff`, `note_history`, `audit_query` | `record_as_of` |
| "prove it / what's the evidence" | `provenance` | `get_attachment` |
| structured predicate over metadata | `property_query` / `query_base` | |
| board / work state | `board`, `task_query` | |
| vault health / structure | `vault_stats`, `schema_drift`, `orphans` | `communities` |
| "does the vault already have this?" | `similar_to_text` | `curator_propose` if not |

Discipline:
- Prefer `read_section` over `read_note` when one procedure/section answers — context
  budget is a feature.
- A `status: degraded` envelope names why and what to do — relay it, don't retry blindly.
- `redacted: true` hits exist but are above your clearance: say something exists, never
  guess its content.
- You cannot write. The only mutation path is `curator_propose` on curator-gate; expect
  ACCEPT / REJECT-with-violations / COUNTER.
