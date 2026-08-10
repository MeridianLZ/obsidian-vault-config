# P4 Initial Bootstrap Prompt

The prompt to paste into the target machine's Copilot CLI session to execute P4 —
instantiate the vault, wire the servers + fence, and verify — producing a fully
functional, compliant knowledge base.

## Should a planning agent run first?

**No — not for the deploy.** P4 is a deterministic runbook (`init-vault.sh` →
`install-plugin.sh` → acceptance checks), not an open-ended task. A planning pass
there adds deviation risk and latency and buys nothing; the "plan" already exists as
verified scripts + `DEPLOY.md`.

**The seed-context optimization is already designed in.** The `sessionStart` hook
injects schema-awareness + board state, and `get_vault_guide` is a one-call primer
(constitution + tag registry + routing map). Every session bootstraps its own optimal
context deterministically — a planning agent would reinvent that, non-deterministically.

**Where planning earns its place: the first knowledge-seeding session, not deploy.**
Deciding initial entity hubs, domain-tag scope, and which sources to ingest first is
open-ended — use a brainstorming pass there, routing every result through the Curator
gate. That is a separate step, after P4.

So: **one session agent, driven by the runbook.**

## Before you paste

Fill the three placeholders:

- `<ABS_KIT_PATH>` — absolute path to this kit repo on the target.
- `<ABS_VAULT_PATH>` — absolute path where the vault will live.
- `--clearance` — defaults to `internal`. This is the R2 access-control boundary; set
  it deliberately to match who runs the session. Raise to `confidential`/`restricted`
  only for sessions that should see that content.

The prompt delegates to `DEPLOY.md` rather than inlining steps — deliberate, so the
runbook stays the single source of truth and the prompt never drifts from the scripts.

## The prompt

```
You are deploying a governed, compliance-grade Obsidian knowledge vault on this
machine. The kit repo is at <ABS_KIT_PATH>. The target vault will live at
<ABS_VAULT_PATH>. This is a system of record (GLBA / SEC 17a-4 / GDPR) — correctness
of process IS the deliverable. Do NOT improvise deploy steps; the scripts are verified.

FIRST, read these in the kit, in order, and do not act until you have:
  1. DEPLOY.md            — the authoritative runbook. Execute it exactly.
  2. 00-vault-initial-state.md  — the schema constitution (what the vault must be).
  3. workflow-registry.md — which workflows are hook-guaranteed vs cadence.

THEN execute DEPLOY.md Steps 1–5 in order, using the kit's own scripts:
  - Pre-flight: confirm node >= 24, `copilot` on PATH, git present, and
    `df -h "$HOME"` shows headroom. If any fail, STOP and report — do not work around.
  - Step 1: deploy/init-vault.sh --target <ABS_VAULT_PATH>
  - Step 2: deploy/install-plugin.sh --vault <ABS_VAULT_PATH> --clearance internal
  - Step 3: open the vault in Obsidian, enable the vendored community plugins
    (Templater, Bases kanban, obsidian-git) per manual §7. (Report this as a
    manual step for the operator if Obsidian isn't scriptable here.)
  - Step 4: deploy/schedule/install-cron.sh --vault <ABS_VAULT_PATH> --print first,
    show me the schedule, then install.
  - Step 5: confirm the git post-commit reindex hook is present.

THEN run DEPLOY.md's four Acceptance Checks and report each PASS/FAIL with the
exact command output:
  1. Fence holds — a direct edit under 10-notes/ is DENIED. This is the one check
     I could not verify remotely (copilot-cli #2540: plugin preToolUse hooks may not
     fire on some CLI versions). If the repo-level .github/hooks/ fence ALSO does not
     fire here, STOP and report — do NOT proceed to trust the vault with content;
     escalate to a policy-level hook source (/etc/github-copilot/policy.d/) or
     configure the layer-3 OS UID isolation in DEPLOY.md "Hardening" first.
  2. Server answers — vault-mcp boots and get_vault_guide returns the constitution.
  3. schema_drift is empty (ok / 0 violations) on the fresh vault.
  4. Gate round-trips — curator_propose a trivial note; expect ACCEPT with a commit
     + audit line, or a REJECT with concrete violations.

HARD RULES (from .github/copilot-instructions.md, which binds every session here):
  - You propose, the Curator disposes. Direct writes only to 01-inbox/ and today's
    daily note. Everything else goes through curator_propose.
  - Never git rebase/amend/force-push; never edit 00-system/audit/.
  - Air-gapped: no network, no plugin installs beyond the vendored set.

Report a final GO / NO-GO: GO only if all four acceptance checks PASS. On NO-GO,
give the exact failing check and its output. Do not declare success without the
check output — evidence before assertions.
```

## After GO

The vault is live and compliant. First real use = the knowledge-seeding session
(brainstorm initial entities/tags/sources, propose through the gate). Ongoing entry
and maintenance follow the primary-agent skills (`.copilot/skills/`) and the Curator
cadences (`deploy/schedule/`).
