---
name: retention-sweep
description: Monthly retention sweep — build the disposal docket from the retention
  register, verify legal holds, package for human sign-off. The Curator never disposes
  autonomously. Use for the monthly retention sweep or when an operator asks what is
  past retention.
---
# Retention Sweep

Records-management discipline: retention is a property of the record, disposal is a
governed event, holds trump everything.

1. **Build the candidate set**: `disposal_docket` (notes past `retention_until`, not
   held). Cross-check each against `hold_set` — any hold appearing mid-sweep removes
   the note from the docket.
2. **Verify per candidate**: `record_class` correctly assigned? `retention_until`
   plausible against `created` + the class's retention rule? Any backlink from a
   held note that suggests hold scope should extend? Doubt ⇒ exclude + flag.
3. **Package the docket**: one `type: system` note per sweep listing every candidate
   (id, path, record_class, retention_until, verification result), submitted through
   the gate, awaiting HUMAN authorization.
4. **On authorization only**: execute disposals as gated `dispose` commits (archive
   moves — never deletes while any doubt remains), one commit + audit line each.
5. Emit `${COPILOT_PLUGIN_DATA}/reports/retention-<YYYY-MM>.json`:
   `{swept, docketed, excluded: [{id, reason}], authorized, disposed, audit_refs}`.
