---
name: erasure-request
description: Process a GDPR Art. 17 erasure request end-to-end — subject discovery,
  record_class partition, lawful-refusal logging, forward-commit redaction, and
  re-index instruction. Use when an operator supplies data-subject identifiers with
  an erasure ticket reference.
---
Inputs (ask if missing): subject identifiers, ticket ref, requesting operator.
1. Discovery: `pii_map` + entity-hub backlinks + `fts_search` on identifiers; enumerate
   every note/chunk. Present the set for operator confirmation before touching anything.
2. Partition by `record_class`: 17a-4/GLBA-retained ⇒ REFUSE erasure citing Art. 17(3)(b);
   log each refusal with basis + ticket in the audit note.
3. Redactable set: forward-commit redaction (`[REDACTED-GDPR-<ticket>]`), structure
   preserved, `pii` re-evaluated, one commit per note, audit line each.
4. Emit the re-index instruction (full pass) and the git-history crypto-shred docket
   for human execution. Never claim history erasure yourself.
5. Output: completion report — counts erased/refused/deferred, commits, audit refs.
