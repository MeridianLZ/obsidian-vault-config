---
name: daily-log
description: Work with today's daily note (30-daily/YYYY-MM-DD.md) — append to the
  Capture section, log decisions and progress. The second free-write zone besides
  01-inbox. Use for "log this", "add to today's note", end-of-session notes, or
  journaling work in progress.
---
# Daily Log

Today's daily (`30-daily/<today>.md`) is proposer-writable; every OTHER daily is
curated (fence-enforced). Never edit yesterday.

1. If today's note is missing, create it from `00-system/templates/tpl-daily-note.md`
   (`type: daily`, `date` = filename date, `status: open`).
2. **Append, don't rewrite**: add bullets under `## Capture` (knowledge fragments —
   drained through the gate daily) or `## Log` (what happened — stays in the daily).
   A capture bullet that outgrows a line becomes a `capture-note` instead.
3. Wikilink first mentions (`[[...]]`) — unresolved targets are legal in dailies;
   the Curator's drain resolves or stubs them.
4. Never flip `status: open → closed` yourself — the drain closes dailies after
   emptying Capture.
