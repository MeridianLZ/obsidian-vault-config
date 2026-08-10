# CURRENT TASK STATE

**As of:** 2026-08-10 · **Branch:** main @ d9d3d36 · **Tree:** clean

P4-readiness audit done + all findings fixed (4 batches). Awaiting cold-auditor
re-verification of the 8 blockers. Nothing else in flight.

## What happened this session (continued)

Fresh-context cold-auditor + inline sweep found 38 findings / 8 blockers. Fixed:
- **A (95ebfde)** fence rewrite: 6 bypasses closed, scoped tokens, dual-source hooks
- **B (8369bed)** deployability: node:sqlite + committed esbuild bundle + init-vault
  + install-plugin + marketplace (air-gap clean)
- **C (a430996)** compliance: classification fail-closed, truthy flags, drafts in
  registers, redaction path-withholding + 8 correctness bugs
- **D (d9d3d36)** 4 templates, ontology pin-down, schema_drift enum coverage,
  cron scheduler, DEPLOY.md

Verify: fresh `init-vault` → schema_drift ok/0. Smoke 57 checks/3 clearances.
Plugin battery 29/29. Bundle runs with node_modules absent.

## Resume point

If blockers confirmed CLOSED → P4 is executable: operator runs DEPLOY.md steps 1–5
on the target machine. If any STILL-OPEN → fix before P4.
Remaining known constraint (by policy, not defect): dense retrieval degraded (no
local embedder on target).

## Verify-before-touching commands

```bash
cd vault-mcp && npm run build && node smoke.mjs            # 23/23 restricted
cd vault-curator && ./test-plugin.sh                        # 15/15
```

Fixture absent? `vault-mcp/make-fixture.sh` regenerates (it is gitignored, generated).

## Key entry points

- vault-mcp tools: `vault-mcp/src/index.ts` (registrations), indexer/graph/gitio/search/bases modules
- Fence: `vault-curator/hooks/scripts/guard-curated-paths.sh`
- Gate server: `vault-curator/gate-server/index.js`
- Workflow map: `workflow-registry.md` (24 rows, classes H/G/S/C)
