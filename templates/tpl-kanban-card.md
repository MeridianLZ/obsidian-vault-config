# Template: Kanban Card (`tpl-kanban-card.md`)

**Engine:** core Templates (no Templater). Cards are cheap, high-volume, and need nothing dynamic beyond `{{date}}`/`{{time}}`.
**Model:** note-per-card. Each card is a first-class note in `20-tasks/` — it carries properties, takes backlinks, appears in search and the graph, and is indexed by the retrieval pipeline. The board is just a Bases *view* over these notes (`00-system/bases/kanban-board.base`); dragging a card between columns rewrites its `status` property. No board-file lock-in, no checkbox lines invisible to retrieval.

**Install:** save the block below as `00-system/templates/tpl-kanban-card.md`. Create cards via the board's "+" (template pre-wired in the view config) or: new note in `20-tasks/` → Insert template.

---

```markdown
---
type: task
id: "{{date:YYYYMMDDHHmmss}}-{{title}}"
summary: ""
aliases: []
tags: []
created: {{date:YYYY-MM-DD}}T{{time:HH:mm:ss}}
modified: {{date:YYYY-MM-DD}}T{{time:HH:mm:ss}}
status: backlog
origin: human
classification: internal
record_class: none
legal_hold: false
pii: false
priority: 3
due:
project:
order: 0
up: []
related: []
source: []
---

# {{title}}

## Outcome
<!-- One sentence: what "done" observably looks like. This doubles as the card's
     dense-retrieval payload — write it self-contained. Then copy it into `summary`. -->

## Context
<!-- Why this exists. Link the driving note/decision/entity on first mention. -->

## Steps
- [ ]

## Related
- 
```

---

## Field notes

- **`id`** — timestamp + title slug via core variables. Unique at human task-creation rates; immutable after creation (rename the file freely, never the `id`).
- **`status`** is the board. Columns in the base: `backlog · todo · doing · blocked · review · done`. Drag-and-drop (Bases kanban view plugin) writes this property; so can the Copilot CLI Primary agent — which is precisely why task mutations are Curator-gated like everything else.
- **`order`** — numeric intra-column sort maintained by the kanban view on drag; leave 0 at creation.
- **`project`** links a `50-entities/` project hub, giving every card a graph anchor: "all open cards for [[Settlement Modernization]]" is one hop, and multi-hop queries can pivot card → project → decisions → sources.
- **`summary` starts empty by design** — the Curator lints `summary: ""` on any card leaving `backlog`: you may capture lazily, but nothing enters active work unindexed.
- **`## Outcome` before `## Steps`:** the outcome sentence is what embeds; checkbox noise is what doesn't. Front-loading the semantic payload is the whole trick.
- Completed cards: `status: done`, then Curator archival sweep moves them to `90-archive/` after the configured cool-off — history preserved, board fast, retention clocks intact.
```
