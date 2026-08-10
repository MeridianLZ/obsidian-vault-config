# Template: System / Decision Note (`tpl-system.md`)

**Engine:** core Templates. **Role:** a `type: system` note in `00-system/schema/` — schema-change proposals, ADR-style decisions, and migration plans. This is the vehicle for constitution §9 change control: schema mutations require a ratified `type: system` decision note with a migration plan.

**Install:** save the fenced block below as `00-system/templates/tpl-system.md`.

```markdown
---
type: system
id: "{{date:YYYYMMDDHHmmss}}-{{title}}"
summary: ""
aliases: []
tags: ["#kind/decision"]
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

## Decision
<!-- The change proposed, stated as a decision. One self-contained paragraph → summary. -->

## Context
<!-- Why now — the problem, the constraint, the evidence. -->

## Migration
<!-- REQUIRED for any schema-artifact change: exactly which existing notes are
     affected and how they are migrated, by whom. The Curator refuses a schema
     mutation whose proposal lacks a migration plan (constitution §9). -->

## Ratification
<!-- ratified_by: <human name> · date: <ISO> · changelog entry: <link>
     A schema change is not applied until a human ratifies it here. -->
```
