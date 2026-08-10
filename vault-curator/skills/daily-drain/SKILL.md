---
name: daily-drain
description: Triage 01-inbox/ and open dailies' Capture sections through the Curator
  gate — promote, convert to task cards, or discard (logged) — then close drained
  dailies and emit a drain report. Use for the daily inbox/daily drain, when the user
  says "drain the inbox", or on the daily stewardship schedule.
---
# Daily Drain

Preconditions: run as the Curator (gate authority required). Idempotent: a second run
on a drained inbox is a no-op that still emits a report.

1. Enumerate work: every file in `01-inbox/` (except `_proposals/`) + every `30-daily/`
   note with `status: open` whose `## Capture` section is non-empty.
2. Per item, decide: **promote** (knowledge → 10-notes/, evidence → 40-sources/,
   person/org/system/regulation/project → 50-entities/), **task-convert** (actionable →
   20-tasks/ card via tpl-kanban-card), or **discard** (log the discard + reason in the
   audit note — discards are audit events).
3. Every promote runs the FULL eight-step gate (gate-mutation skill) — promotion is the
   promote-capture skill's sub-procedure: stamp schema, alias sweep, entity-hub creation,
   first-mention linking.
4. Drained dailies: flip `status: open → closed`, one gated commit each.
5. Emit the drain report to `${COPILOT_PLUGIN_DATA}/reports/drain-<YYYY-MM-DD>.json`:
   `{date, promoted: [...], converted: [...], discarded: [{path, reason}], dailies_closed: n,
   audit_refs: [...]}` — and reconcile `${COPILOT_PLUGIN_DATA}/write-audit.jsonl` entries
   against the audit log (unexplained writes → flag in the report).
