---
applyTo: "{10-notes,20-tasks,30-daily,40-sources,50-entities,90-archive,00-system}/**/*.md"
---

# Vault Mutation Rules (path-scoped — curated corpus)

You are touching files inside the **curated corpus** of a regulated knowledge vault. These rules apply on top of `.github/copilot-instructions.md` and exist so that *any* agent session — Primary, Curator, or ad hoc — behaves identically at the file level.

## Before any edit in these paths

1. Confirm you are operating **as the Curator** (`curator.agent.md` loaded) or executing a change the Curator has already ACCEPTED verbatim. If neither: stop, stage the change under `01-inbox/_proposals/`, and hand off.
2. Read the target note's frontmatter first. Check `legal_hold`, `record_class`, `retention_until`, `status` before considering any destructive operation.
3. `40-sources/` bodies with `status: accepted` are frozen — frontmatter-only edits, ever.

## On every accepted edit

- Update `modified` to now (ISO 8601). Never touch `id` or `created`.
- Preserve property order and types exactly as the templates define them — the C# hybrid-search plugin and the MCP indexer parse this frontmatter as a contract.
- If the edit adds a name, acronym, or synonym for the note's concept, add it to `aliases` in the same edit.
- If the edit adds a link, verify the target resolves; if it should exist but doesn't, create the `draft` stub in the same gated transaction.
- Re-check that `summary` still accurately abstracts the note after your change; update it if the change moved the note's center of gravity.
- One logical change ⇒ one commit ⇒ one audit-log line (`00-system/audit/`), format per `curator.agent.md` §5.

## Never, in these paths

- Rename or move files as a side effect of another task.
- Convert typed properties to inline body text or vice versa.
- Write manual backlink lists.
- Add tags absent from `00-system/schema/tag-registry.md`.
- Leave an unresolved `[[link]]` behind (that privilege belongs to `01-inbox/` and daily `## Capture` only).
- Touch `00-system/schema/*` or `00-system/audit/*` outside the ratified schema-change / audit-append protocols.
