# Template: Audit Log (`tpl-audit.md`)

**Engine:** core Templates. **Role:** the monthly append-only audit note in `00-system/audit/` (one per month, `YYYY-MM.md`). This is the human-readable half of the SEC 17a-4 audit trail (git is the other half). `legal_hold: true` by default — audit notes are never edited except by append, never deleted.

**Install:** save the fenced block below as `00-system/templates/tpl-audit.md`. The Curator creates each month's note on first mutation of that month.

```markdown
---
type: audit
id: "AUDIT-{{date:YYYY-MM}}"
summary: "Curator audit log for {{date:YYYY-MM}} — append-only record of every accepted and refused mutation."
aliases: []
tags: []
created: {{date:YYYY-MM-DD}}T{{time:HH:mm:ss}}
modified: {{date:YYYY-MM-DD}}T{{time:HH:mm:ss}}
status: active
origin: agent
classification: internal
record_class: sec-17a4
retention_until:
legal_hold: true
pii: false
---

# Audit Log — {{date:YYYY-MM}}

<!-- Append-only. One line per accepted OR refused mutation, format per
     curator.agent.md §5:
     - <ISO timestamp> | <verb> | <id> | <path> | proposer=<…> | commit=<sha> | note=<one line incl. any refusal + cited basis>
     Refusals and rejections are entries too — a refused destructive action is a
     regulated event. Never rewrite a prior line. Never delete this file. -->
```
