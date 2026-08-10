---
type: system
id: SYS-RETENTION-RULES
summary: The record_class → retention-period derivation table. Gives the Curator and self-healing agent a machine rule to compute retention_until from created + record_class, so the most consequential compliance date is never guessed.
aliases: [retention rules, retention table]
tags: []
created: 2026-08-10T00:00:00Z
modified: 2026-08-10T00:00:00Z
status: active
origin: human
classification: internal
record_class: none
legal_hold: false
pii: false
---

# Retention Rules

`retention_until` is **derived, not guessed**: `retention_until = <retention_anchor> + <period>`. The Curator refuses any destructive mutation before this date; `self-healing` computes it when missing.

| `record_class` | Period | Anchor | Basis |
|---|---|---|---|
| `none` | — | — | not a record; no retention clock |
| `sec-17a4` | **6 years** | `created` (or `ingested` for sources) | SEC Rule 17a-4(b) general 6-year retention; first 2 years accessible (met — whole vault is live) |
| `glba-npi` | **5 years** after relationship end | `modified` (proxy for last activity) until relationship-end is known; then recompute | GLBA Safeguards + FTC guidance; conservative 5-year default |
| `gdpr-personal` | **until purpose fulfilled, max 6 years** | `created` | GDPR storage-limitation (Art. 5(1)(e)); capped to the 17a-4 ceiling where records overlap |
| `gdpr-special` | **shortest lawful — review at 1 year** | `created` | Art. 9 special-category data; minimize aggressively |

## Cardinality & conflict

- `record_class` is a **list**. Multiple classes ⇒ retention is the **maximum** of their computed dates (the longest obligation wins), EXCEPT a `legal_hold: true` overrides all dates (indefinite).
- `none` is exclusive: a note is either `[none]` or a list of non-`none` classes, never both.
- Where GDPR erasure conflicts with 17a-4/GLBA retention, retention wins and erasure is refused under Art. 17(3)(b) — the refusal is logged (curator.agent.md §4).

## Computation note (for `self-healing`)

```
periods = { "sec-17a4": {years:6, anchor:"created|ingested"},
            "glba-npi": {years:5, anchor:"modified"},
            "gdpr-personal": {years:6, anchor:"created"},
            "gdpr-special": {years:1, anchor:"created", review:true} }
retention_until = max( anchor_date(class) + period(class) for class in record_class )
```
Anchor dates absent ⇒ do not guess: flag for human, never stamp a fabricated date.

This is a schema artifact (constitution §9); period changes require a ratified proposal + changelog entry.
