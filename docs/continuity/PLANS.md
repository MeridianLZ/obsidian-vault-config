# PLANS — Implementation Runbook

**Phase:** P4 execution — stand up the live vault on the target machine and reach a
fully functional, compliant knowledge base. The kit (design + build + audit
remediation) is complete and pushed; see `docs/proto-implementation/continuity/` for
that history.

## Goal

Execute `docs/initial-prompt.md` on the target and reach **GO** (all four acceptance
checks pass), then complete the first knowledge-seeding session.

## Phases

| Phase | Scope | Status |
|---|---|---|
| I0 | Pre-flight on target (node≥24, copilot, git, disk) | ⏳ pending |
| I1 | init-vault.sh → schema-complete vault + git epoch | ⏳ pending |
| I2 | install-plugin.sh → servers + fence wired | ⏳ pending |
| I3 | Obsidian: enable vendored community plugins (manual §7) | ⏳ pending |
| I4 | Cadence scheduler (install-cron.sh) | ⏳ pending |
| I5 | Acceptance checks 1–4 → GO/NO-GO | ⏳ pending |
| I6 | Hardening: verify fence fires on target CLI; layer-3 OS UID isolation | ⏳ pending |
| I7 | First knowledge-seeding session (brainstorm entities/tags/sources → gate) | ⏳ pending |

## Current facts

- Bootstrap prompt: `docs/initial-prompt.md`. Runbook SSoT: `DEPLOY.md`.
- Kit repo pushed: `github:/zautke/obsidian-vault-config` @ `e3bcb57`.
- Deploy is deterministic scripts — no planning agent for it. Seed-context is
  designed-in (sessionStart hook + `get_vault_guide`).

## Non-goals (this phase)

- Changing the kit/specs — those are ratified. Bugs found during I-phases route back
  as gated fixes, but scope is execution, not redesign.
- Dense/semantic retrieval on the target — degraded by policy (local-model ban).

## The one risk to watch

Acceptance check #1: does the `.github/hooks/` fence actually fire on the target's
Copilot CLI version (copilot-cli#2540)? If not, NO-GO until escalated to a policy-level
hook source or layer-3 OS isolation is configured. Do not trust the vault with
regulated content before this passes.
