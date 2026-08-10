# CURRENT TASK STATE — Implementation Runbook

**As of:** 2026-08-10 · **Branch:** main · **Phase:** P4 not yet started

The kit is built, audited, remediated, and pushed (`origin/main`). Implementation
(P4 execution on the target machine) has **not started** — this set is the seed.

## Resume point

Start at **I0 pre-flight** on the target. Drive the deploy with the prompt in
`docs/initial-prompt.md` (fill `<ABS_KIT_PATH>`, `<ABS_VAULT_PATH>`, `--clearance`).
`DEPLOY.md` is the authoritative runbook.

## First commands (on target)

```bash
node --version && command -v copilot && git --version && df -h "$HOME" | tail -1
# then, from the kit repo:
deploy/init-vault.sh --target <ABS_VAULT_PATH>
deploy/install-plugin.sh --vault <ABS_VAULT_PATH> --clearance internal
```

## The gate before trusting the vault

Acceptance check #1 (a direct `10-notes/` edit is DENIED) MUST pass on the target's
own Copilot CLI version. If it doesn't, the fence isn't firing (copilot-cli#2540) —
NO-GO until escalated. See DEPLOY.md "Hardening".

## Where things are

- Bootstrap prompt: `docs/initial-prompt.md`
- Runbook: `DEPLOY.md` · Constitution: `00-vault-initial-state.md`
- Proto/build+audit history: `docs/proto-implementation/continuity/`
