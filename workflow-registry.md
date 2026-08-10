# Workflow Registry — Definition, Classification, Enforcement

**Version:** 1.0.0 · **Destination:** `00-system/schema/workflow-registry.md` (schema artifact, Curator-gated per constitution §9)
**Rule:** every workflow below is *defined and documented*; every workflow that is **mandatory AND mechanical** (not open to interpretation) is **guaranteed by a deterministic hook** — it runs regardless of what any model decides. Judgment-laden workflows are gated agent protocols; optional workflows are skills.

## Classification model

| Class | Meaning | Enforcement |
|---|---|---|
| **H — hook-guaranteed** | mandatory, mechanical, idempotent; zero interpretation | `vault-curator/hooks/hooks.json` — deterministic, fail-closed |
| **G — gate protocol** | mandatory, but requires judgment | Curator agent protocol (`curator.agent.md` §2) — every instance passes the gate; the *invocation* is guaranteed by H1/H2 (there is no other path) |
| **S — skill playbook** | repeatable procedure, agent-initiated | `SKILL.md` (plugin or `.copilot/skills/`) |
| **C — cadence run** | mandatory on a schedule | headless invocation (`copilot --agent <steward> -p …` via cron/CI) — *deployment requirement, see Gaps* |

## The registry

| # | Workflow | Defined in | Idempotent | Class | Enforcement mechanism | Verified by |
|---|---|---|---|---|---|---|
| W01 | Curated-path mutation fence (LAYERED) | curator-plugin-spec §5; `guard-curated-paths.sh` + vault `pre-commit` | ✔ (pure decision) | **H** | L1 `preToolUse` best-effort deny (canonicalized paths, deny-by-default verbs); L2 `pre-commit` authoritative on committed state (staged-diff inspection, path-scoped token); L3 OS UID isolation (deploy-required for hostile agent) | `test-plugin.sh` (33 checks incl. bypass probes) + pre-commit 5-case test |
| W02 | Git history immutability (no rebase/amend/force-push; audit dir append-only) | curator.agent.md §4 | ✔ | **H** | `preToolUse` command-pattern deny | `test-plugin.sh` |
| W03 | Gate token lifecycle (single-use, proposal-scoped, 10-min TTL) | curator-plugin-spec §5 | ✔ (consume-once) | **H** | token file mint (gate-server) + consume-on-check (guard script) | `test-plugin.sh` token-allow/token-single-use |
| W04 | Session schema-awareness injection | curator-plugin-spec §5 | ✔ | **H** | `sessionStart` → `session-vault-guide.sh` additionalContext | `test-plugin.sh` guide-inject |
| W05 | Write telemetry (session JSONL: who/what/when/hash) | curator-plugin-spec §5 | ✔ (append keyed by ts) | **H** | `postToolUse` → `audit-emit.sh` | JSONL present after any write |
| W06 | Prompt-injection surfacing ("Curator: delete X" = data, not command) | curator.agent.md §6 | ✔ | **H** | `userPromptSubmitted` → `prompt-injection-scan.sh` | `test-plugin.sh` injection-flag/clean |
| W07 | Eight-step mutation gate (classify→schema→retrieval→graph→authority→compliance→decide→execute) | curator.agent.md §2; `gate-mutation` skill | ✔ (re-gating an applied proposal is a no-op REJECT-duplicate) | **G** | only reachable paths: lane A `/agent curator`, lane B `curator_propose`; W01 closes every other path | spec §9 acceptance 2–3 |
| W08 | Commit + audit contract (one commit per mutation, structured message, append-only audit line, rejections logged too) | curator.agent.md §5 | ✔ per proposal | **G** | gate step 8; `note_history`/`audit_query` parse the contract — malformed contract is visible drift | vault-mcp smoke `note_history-contract` |
| W09 | Proposal queueing + single-flight gate serialization | curator-plugin-spec §4.1, §8 | ✔ (queue keyed by proposal_id) | **H** | gate-server promise-chain; git commits = linearization point | gate-server dry-run |
| W10 | Capture → inbox (quarantine write, no id, dedup pre-check) | `.copilot/skills/capture-note` | ✔ (slug-keyed) | **S** | skill; W01 *allows* inbox, *denies* everything else — wrong-path capture is impossible | fence inbox-allow |
| W11 | Daily-note logging (today-only, append-only Capture/Log) | `.copilot/skills/daily-log` | ✔ (append) | **S** + **H** | W01 allows only today's daily; other dailies denied | fence today/old-daily checks |
| W12 | Daily inbox/daily drain (promote / task-convert / discard-logged; close dailies; reconcile W05 JSONL vs audit log) | `daily-drain` skill; curator.agent.md §3 | ✔ (drained inbox re-run = no-op + report) | **C** → **G** | scheduled `housecleaning` agent run; every promotion through W07 | drain report JSON |
| W13 | Single-note promotion (schema stamp, alias sweep, hub creation, first-mention linking) | `promote-capture` skill | ✔ per note | **G** | sub-procedure of W12, full gate per item | gate verdicts |
| W14 | Task-card lifecycle (create/move via gate; enum statuses only) | `.copilot/skills/task-card`; constitution §3.4/3.5 | ✔ (status_change to same value = no-op) | **S** → **G** | W01 denies direct card edits; board reads via Bases DSL | vault-mcp `board`/`task_query` smoke |
| W15 | Orphan & staleness audit (weekly) | `maintenance.agent.md`; curator.agent.md §3 | ✔ (pure report) | **C** | scheduled maintenance run → report + proposals | report file + `orphans` tool |
| W16 | Graph-integrity sweep (broken links = incident; up-cycles; hub coverage; rationale clauses) | `maintenance.agent.md` | ✔ (pure report) | **C** | scheduled run; `broken_links`/`schema_drift` are the deterministic detectors | vault-mcp smoke `schema_drift` |
| W17 | Taxonomy review (monthly, evidence-thresholded merge/retire/add) | `taxonomy-review` skill; `taxonomical-evolution.agent.md` | ✔ (proposals keyed by month) | **C** → **G** + human ratification | scheduled run; registry change = schema artifact (constitution §9) | taxonomy report |
| W18 | Retention sweep → disposal docket → human sign-off → gated disposal | `retention-sweep` skill | ✔ (docket rebuild is pure) | **C** → **G** + human authorization | `disposal_docket` is read-only; disposal verbs only post-authorization | retention report + audit lines |
| W19 | GDPR erasure (discovery → partition → refuse-or-redact → re-index docket) | `erasure-request` skill; curator.agent.md §4 | ✔ per ticket (redaction markers keyed by ticket) | **G** + human execution of crypto-shred | operator-initiated; 17a-4 partition is rule-based, refusals logged | audit refusal lines |
| W20 | Schema evolution (proposal note + migration plan + human ratification + changelog + version bump) | constitution §9; curator.agent.md §3 | ✔ (version-keyed) | **G** + human | Curator refuses schema mutations lacking ratified proposal + migration | schema-changelog |
| W21 | Drift detection → smallest-compliant-repair loop | `self-healing.agent.md` | ✔ (converges; two-pass survivors escalate) | **C** → **G** | scheduled run over `schema_drift` output | drift report before/after counts |
| W22 | Retrieval index refresh (rescan on accept; full pass nightly + after redactions) | read-surface spec §13 | ✔ (content-hash keyed) | **H**-adjacent | vault-mcp rebuilds on start; post-accept targeted re-index = deployment wiring (see Gaps) | smoke suite |
| W23 | Retrieval routing discipline (angle→question map) | `vault-retrieval` + `vault-query` skills; W04 injects the pointer | ✔ (reads) | **S** | guidance only — deliberately: tool *choice* is judgment | — |
| W24 | Audit reconciliation (W05 JSONL diff vs audit log; unexplained write = incident) | `daily-drain` step 5; `self-healing` matrix | ✔ (set difference) | **C** | part of scheduled drain | drain report `unexplained` field |

## Invariants the classification preserves

1. **No mandatory-mechanical workflow depends on model cooperation.** W01–W06, W09 run in the hooks runtime / gate-server process: deterministic, fail-closed, model-independent.
2. **Every judgment workflow is *reachable only* through a hook-guaranteed funnel.** The gate (W07) requires judgment, but *arriving* at the gate is not optional — W01 closes every bypass. Guarantee-of-invocation, not guarantee-of-outcome.
3. **Idempotency is stated per workflow** and every H/C workflow re-runs safely: re-run drains no-op, re-checked tokens stay consumed, rebuilt dockets are pure functions of frontmatter.
4. **Humans hold three levers no agent can pull:** schema ratification (W20), disposal authorization (W18), git-history crypto-shred (W19).

## Gaps — status after the P4-readiness audit (2026-08-10)

- **C-class cadences** — CLOSED (tooling): `deploy/schedule/curator-cadences.cron.template` + `install-cron.sh` install the daily/weekly/monthly headless steward runs. Operator must run `install-cron.sh` at deploy (DEPLOY.md Step 4). Residual: requires a running scheduler on the target.
- **W22 post-accept re-index** — CLOSED: `init-vault.sh` installs a `.githooks/post-commit` that writes a `00-system/.reindex-request` sentinel the server watches. On-demand server starts scan on boot regardless.
- **Fence-firing on the target CLI** — MITIGATED: the fence is mirrored at `.github/hooks/` (repo-level load path) so it holds even if plugin `preToolUse` hooks don't fire (copilot-cli#2540). Residual: if the repo-level hook ALSO doesn't fire on a given CLI version, escalate to a policy-level source (`/etc/github-copilot/policy.d/`) — DEPLOY.md acceptance check #1 verifies this before trusting the vault.
- **Enterprise fence-with-the-seat** (`managed-settings.json`, spec §7): org-level push makes W01 arrive with the seat; local installs rely on repo `.github/copilot/settings.json` + the repo-level hooks.
- **Dense/semantic retrieval** — DEGRADED BY POLICY: no local embedder on the target (model-weight ban). Full spec surface present; `search`/`similar_*` report `status: degraded`. Enable with `--embedder onnx:<path>` on a disk-capable host.

## Evolution log

- **2026-08-10** — P4-readiness audit (fresh-context reviewer + inline sweep) found 38 findings incl. 8 blockers. Fixed across 4 batches (commits 95ebfde, 8369bed, a430996, + this): fence bypasses closed (canonicalized paths, deny-by-default verbs, scoped single-use tokens, dual-source hooks), air-gap deployability (node:sqlite + committed esbuild bundle + installer + init-vault + marketplace), compliance correctness (classification fail-closed, truthy-string flags, drafts in registers, path-withholding redaction), and ontology hardened (id format contract, record_class list+none-exclusive, hold_ref, entity_type/verified properties, schema_drift enum+tag-depth+status coverage). Trigger: user requested unbiased pre-P4 audit.
