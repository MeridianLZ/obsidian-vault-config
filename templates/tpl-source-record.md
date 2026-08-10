# Template: Source Record (`tpl-source-record.md`)

**Engine:** core Templates. **Role:** an evidence record in `40-sources/` — a filing, policy, doc, or external reference. Body is **frozen** after Curator acceptance (`status: accepted`); only review/retention frontmatter changes thereafter. The `doc_hash` is the integrity anchor the `provenance` tool returns.

**Install:** save the fenced block below as `00-system/templates/tpl-source-record.md`.

```markdown
---
type: source
id: "{{date:YYYYMMDDHHmmss}}-{{title}}"
summary: ""
aliases: []
tags: []
created: {{date:YYYY-MM-DD}}T{{time:HH:mm:ss}}
modified: {{date:YYYY-MM-DD}}T{{time:HH:mm:ss}}
status: quarantined
origin: human
classification: internal
record_class: none
retention_until:
legal_hold: false
pii: false
author: []
published:
ingested: {{date:YYYY-MM-DD}}
doc_hash: ""
up: []
related: []
source: []
---

# {{title}}

<!-- Summary = a self-contained abstract of what this source SAYS, not what it is.
     "FedWire OC-6 governs wire operations; §4 sets cutoff and recall rules." -->

## Provenance
<!-- Where it came from, who issued it, the version/edition, and how it was obtained.
     Fill doc_hash with the SHA-256 of the original artifact stored in 40-sources/_assets/. -->

## Content
<!-- The evidence body. After Curator acceptance this becomes immutable. -->
```
