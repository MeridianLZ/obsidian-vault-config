# Template: Daily Note (`tpl-daily-note.md`)

**Engine:** Templater — the vault's single Templater exception.
**Why the squeeze is justified:** core Templates cannot compute yesterday/tomorrow links or derive the weekday from the note's *title* (which matters when you create a daily note retroactively). Prev/next navigation is what makes the daily layer a traversable timeline for both humans and hop-expansion retrieval; without it each day is an island. Everything below the frontmatter is plain markdown and degrades gracefully if Templater is ever removed.

**Install:** save the block below as `00-system/templates/tpl-daily-note.md`. Settings → Daily notes → Template file location → this file. Templater settings → enable "Trigger Templater on new file creation". Daily notes folder `30-daily/`, format `YYYY-MM-DD`.

---

```markdown
---
type: daily
id: <% Date.now().toString(36) + Math.random().toString(36).slice(2, 10) %>
summary: "Daily note for <% moment(tp.file.title, "YYYY-MM-DD").format("dddd, MMMM D, YYYY") %>."
aliases: []
tags: []
created: <% tp.date.now("YYYY-MM-DDTHH:mm:ssZ") %>
modified: <% tp.date.now("YYYY-MM-DDTHH:mm:ssZ") %>
status: open
origin: human
classification: internal
record_class: none
legal_hold: false
pii: false
date: <% tp.file.title %>
---

# <% moment(tp.file.title, "YYYY-MM-DD").format("dddd, MMMM D, YYYY") %>

[[<% moment(tp.file.title, "YYYY-MM-DD").subtract(1, "d").format("YYYY-MM-DD") %>|← yesterday]] · [[<% moment(tp.file.title, "YYYY-MM-DD").add(1, "d").format("YYYY-MM-DD") %>|tomorrow →]]

## Focus
<% tp.file.cursor() %>

## Log
-

## Capture
> Inbox-bound. Anything here that survives the day gets promoted by the Curator — link liberally, even to notes that don't exist yet.

-

## Decisions
-

## End of day
- **Done:**
- **Carried:**
- **Noticed:**
```

---

## Field notes

- **`id`** uses a compact timestamp+random slug (no external ULID lib in an air-gapped Templater sandbox); collision-safe at daily-note volume and stable forever after creation.
- **`summary`** is deliberately formulaic — daily notes are timeline glue, not knowledge; a predictable summary keeps them from polluting dense-retrieval space while still being findable.
- **`## Capture`** is the only place unresolved `[[links]]` are permitted vault-wide (initial-state spec §5.1). The Curator's promotion pass drains it.
- **`## Decisions`** entries are promotion candidates for `10-notes/` with `#kind/decision` — decisions are the highest-value retrieval targets a daily layer produces.
- Weekday/nav derive from `tp.file.title`, not the clock, so retro-created notes are correct.
- `status: open → closed` is flipped by the Curator during its daily sweep once the note is drained; closed dailies with `record_class: none` become archival candidates per retention policy.
```
