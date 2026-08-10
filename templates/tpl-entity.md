# Template: Entity Hub (`tpl-entity.md`)

**Engine:** core Templates. **Role:** a link hub in `50-entities/` — one canonical note per person, org, system, regulation, or project. Entities give backlinks a place to accumulate and multi-hop queries their pivot points. Exactly one hub per concept; all variant names are `aliases` here, never competing notes.

**Install:** save the fenced block below as `00-system/templates/tpl-entity.md`.

```markdown
---
type: entity
id: "{{date:YYYYMMDDHHmmss}}-{{title}}"
summary: ""
aliases: []
tags: []
created: {{date:YYYY-MM-DD}}T{{time:HH:mm:ss}}
modified: {{date:YYYY-MM-DD}}T{{time:HH:mm:ss}}
status: active
origin: human
classification: internal
record_class: none
legal_hold: false
pii: false
entity_type: org
up: []
related: []
source: []
---

# {{title}}

<!-- Summary = who/what this entity is, self-contained. entity_type is one of:
     person · org · system · regulation · project (constitution §3.4). Set pii: true
     and classification: confidential+ for a person entity carrying personal data. -->

## Overview
<!-- What the entity is and why it matters to this vault. Backlinks below accumulate
     automatically — never maintain a manual "linked from" list. -->
```
