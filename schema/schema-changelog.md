---
type: system
id: SYS-SCHEMA-CHANGELOG
summary: Append-only log of every change to the schema constitution, tag registry, templates, and .base files. Each entry records date, artifact, change, migration, and ratifying human.
aliases: [schema changelog]
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

# Schema Changelog

Append-only (constitution §9). Every schema-artifact mutation lands here as one entry. Newest first.

Format:
```
## <ISO date> — <artifact> — v<old>→v<new>
- change: <what>
- reason: <why>
- migration: <how existing content was migrated, or "n/a (additive)">
- ratified_by: <human name>
- proposal: <link to the type:system decision note>
```

---

## 2026-08-10 — constitution v1.0.0 → v1.1.0 — initial ontology hardening
- change: pinned `id` to ULID-lite (`<epoch36><rand>`), declared `record_class` list-typed with `none` exclusivity, added `hold_ref` (Text), `entity_type` enum, `verified` (Checkbox) for provenance state, `retention-rules.md` derivation table; defined `origin` values precisely.
- reason: P4-readiness audit found these under-specified — a curator agent could not enforce them deterministically.
- migration: n/a — no live corpus exists yet; changes apply from the epoch.
- ratified_by: <pending operator sign-off at deployment>
- proposal: this changelog entry stands as the record pending §8 execution.

## 2026-08-10 — vault v1.0.0-initial-state — epoch
- change: schema-complete empty vault created per constitution §8.
- reason: audit-trail epoch.
- migration: n/a.
- ratified_by: <operator>
- proposal: 00-vault-initial-state.md
