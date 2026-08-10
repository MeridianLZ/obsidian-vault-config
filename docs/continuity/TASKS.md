# TASKS — Implementation Runbook

## P4 execution (on the target machine)

- [ ] I0 Pre-flight: `node --version` ≥24, `command -v copilot`, `git --version`, `df -h "$HOME"` headroom
- [ ] I1 `deploy/init-vault.sh --target <ABS_VAULT_PATH>` → verify tree, templates extracted, `v1.0.0-initial-state` tag
- [ ] I2 `deploy/install-plugin.sh --vault <ABS_VAULT_PATH> --clearance <level>` → verify `.mcp.json` absolute paths, 0 `${`
- [ ] I3 Obsidian: enable Templater, Bases kanban, obsidian-git (manual §7); confirm kanban base renders
- [ ] I4 `deploy/schedule/install-cron.sh --vault <ABS_VAULT_PATH> --print` then install
- [ ] I5a Acceptance #1: direct edit under `10-notes/` is DENIED (the load-bearing check)
- [ ] I5b Acceptance #2: vault-mcp boots; `get_vault_guide` returns the constitution
- [ ] I5c Acceptance #3: `schema_drift` = ok / 0 violations on fresh vault
- [ ] I5d Acceptance #4: `curator_propose` a trivial note → ACCEPT with commit + audit line
- [ ] I5 → declare **GO** only if all four PASS
- [ ] I6 Hardening: confirm fence fires on the target CLI version; configure layer-3 OS UID isolation
- [ ] I7 First knowledge-seeding session (brainstorm → gate)

## Blocked-until

- I5–I7 blocked until I1–I4 complete.
- I7 blocked until GO (I5) AND I6 hardening confirmed.

## If a check FAILS

Do not work around. Record the exact failing command + output in SESSION_LOG, stop,
and decide: fix in the kit (gated) vs environment issue on target. Acceptance #1
failure = escalate hooks to policy-level or configure OS isolation before proceeding.
