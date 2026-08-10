# REMEMBER — Implementation Runbook (append-only)

## 2026-08-10 (seed)

- **This is the implementation phase.** The kit (design/build/audit) is DONE and its
  continuity history lives in `docs/proto-implementation/continuity/` — read that for
  the "why" behind any kit decision. This set tracks P4 execution only.
- **Deploy is deterministic scripts, not an agent task.** `init-vault.sh` →
  `install-plugin.sh` → `install-cron.sh` → acceptance checks. Do NOT improvise steps.
- **No planning agent for deploy.** Seed-context is designed-in: sessionStart hook
  injects the guide + board; `get_vault_guide` is the one-call primer. Reserve
  brainstorming for the first knowledge-seeding session (I7), not deploy.
- **Acceptance #1 (fence fires) is the one thing unverifiable off-target** —
  copilot-cli#2540: plugin preToolUse hooks may not fire on some CLI versions. The
  repo-level `.github/hooks/` mirror is the mitigation; policy-level hooks
  (`/etc/github-copilot/policy.d/`) + OS UID isolation are the fallbacks. Verify on
  the target before regulated content enters.
- **The fence is 3 layers, only 2 travel in the repo.** L1 preToolUse (best-effort),
  L2 git pre-commit (authoritative on committed state), L3 OS UID isolation
  (deploy-configured, NOT in the repo — the operator must set it up).
- **Clearance is set at install** (`--clearance`), server-side, per session identity.
  It's the R2 access-control boundary — pick deliberately.
- **You propose, the Curator disposes.** Even during implementation: direct writes
  only to `01-inbox/` and today's daily; everything else via `curator_propose`.
- **Never** git rebase/amend/force-push; never edit `00-system/audit/` (append-only,
  17a-4 evidence — the pre-commit hook enforces append-only there).
