---
name: propose-mutation
description: Submit a mutation of the curated corpus through the Curator gate
  (curator_propose → curator_status) and handle ACCEPT/REJECT/COUNTER verdicts.
  Use whenever changing anything under 10-notes, 20-tasks, 40-sources, 50-entities,
  90-archive, or 00-system — the only mutation path that exists.
---
# Propose Mutation

Direct edits to curated paths are hook-denied. The gate is not bureaucracy — it is
how the vault stays schema-valid, deduplicated, and 17a-4-auditable.

1. **Pre-flight** (cheap, prevents most REJECTs):
   - dedup: `similar_to_text` on new content; update the canonical note instead of
     creating a sibling
   - schema: all universal + compliance properties present; `summary` self-contained
     ≤3 sentences; aliases swept; `## Related` entries carry rationale clauses
   - links resolve (`resolve` each target) or are flagged for stub creation
2. **Submit** — `curator_propose`:
   ```jsonc
   { "kind": "diff | new_file | edit_instruction | status_change | bulk",
     "target": "<vault-relative path>",       // null for new_file placement-by-Curator
     "payload": "<unified diff | full body | precise instruction>",
     "proposer": "<agent-id>:<user>",         // recorded verbatim in the audit trail
     "rationale": "<why — the Curator and the audit log both read this>",
     "bulk_manifest": ["<every file>"]        // bulk ONLY with full enumeration
   }
   ```
3. **Poll** `curator_status` with the `proposal_id`:
   - **ACCEPT** → done: report the `commit` + `audit_ref` to the user. The
     `gate_token` is the Curator's execution artifact — you never need it yourself.
   - **REJECT** → `violations[]` name the exact constitution section + concrete fix.
     Fix and resubmit; never argue, never work around.
   - **COUNTER** → the Curator's counter-diff. Present it to the user; accepting it
     means resubmitting the counter as your proposal.
4. **Never**: batch unrelated changes in one proposal; propose git-history edits;
   propose audit-log edits; resubmit an unchanged rejected proposal.
