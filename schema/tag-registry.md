---
type: system
id: SYS-TAG-REGISTRY
summary: The controlled tag vocabulary for the vault — the authoritative thesaurus. A tag not listed here is a Curator lint error. New tags enter only via a Curator-approved registry mutation with a scope note.
aliases: [tag registry, controlled vocabulary]
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

# Tag Registry

Controlled vocabulary. Rules (constitution §4): always nested, lowercase-kebab, depth ≤ 3, max 5 tags/note. Tags are navigational facets only — anything with a value/date/lifecycle is a property.

Format: one bullet per registered tag — `#namespace/path — scope note (what it covers / what it excludes)`.

## `#domain/` — business & subject matter

- `#domain/payments — payment rails, operations, and instruments broadly` 
- `#domain/payments/ach — ACH-specific: NACHA rules, return codes, SEC codes`
- `#domain/payments/wire — wire transfers: FedWire, recalls, cutoffs`
- `#domain/lending — origination, servicing, credit decisioning`
- `#domain/compliance — regulatory obligations broadly`
- `#domain/compliance/aml — anti-money-laundering, BSA, SAR/CTR`
- `#domain/compliance/privacy — GLBA/GDPR data-protection obligations`

## `#kind/` — content genre (orthogonal to `type`)

- `#kind/procedure — step-by-step operational how-to`
- `#kind/decision — a decision record (ADR-like); why a choice was made`
- `#kind/definition — a term/concept definition`
- `#kind/postmortem — incident analysis after the fact`
- `#kind/reference — lookup material (tables, code lists)`

## `#audience/` — intended reader group

- `#audience/engineering — technical implementers`
- `#audience/compliance — compliance & risk staff`
- `#audience/operations — ops / back-office staff`
- `#audience/exec — leadership summary level`

## Change control

New tags, merges, retirements: propose via the `taxonomy-review` skill → Curator gate → schema-changelog entry. This file is a schema artifact (constitution §9); mutating it requires a ratified proposal + migration note.
