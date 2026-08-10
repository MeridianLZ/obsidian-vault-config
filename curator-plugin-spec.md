# Curator Plugin Specification — Packaging the Gate as a Copilot CLI Plugin

**Version:** 1.0.0
**What this delivers:** the Curator ceases to be "an agent file you hope gets invoked" and becomes an **installable, versioned governance package**: a Copilot CLI plugin bundling the Curator agent, its skills, lifecycle hooks that make the gate *unbypassable*, and an MCP server that wraps the Curator as a first-class tool other primary agents — Copilot or any MCP client — call directly.

Verified against the GA Copilot CLI plugin system (plugin.json manifest; agents/skills/hooks/mcpServers components; marketplace.json distribution; `~/.copilot/installed-plugins/` caching; enterprise `managed-settings.json` push).

---

## 1. Architecture: Two Lanes, One Gate

```
                         ┌─────────────────────────────────────────────┐
                         │              vault-curator plugin           │
                         │                                             │
 Copilot CLI session ────┼─► Lane A: native subagent delegation        │
 (Primary agent)         │   /agent curator · auto-inferred · task()   │
                         │   curator.agent.md + skills, own context    │
                         │                        │                    │
 Claude Code / Codex /   │                        ▼                    │
 any MCP client ─────────┼─► Lane B: curator-gate MCP server           │
 (other primary agents)  │   curator_propose / curator_status /        │
                         │   curator_report — wraps `copilot --agent   │
                         │   curator -p …` programmatically            │
                         │                        │                    │
                         │                        ▼                    │
                         │        ONE gate protocol (curator.agent.md  │
                         │        §2), ONE audit log, ONE commit       │
                         │        contract — regardless of lane        │
                         │                                             │
                         │   hooks.json: preToolUse guard = the fence  │
                         │   that makes both lanes the ONLY lanes      │
                         └─────────────────────────────────────────────┘
```

**Lane A (native)** — inside Copilot CLI, the Curator is a custom agent: explicitly via `/agent curator` or `copilot --agent curator --prompt "…"`, or *inferred* — Copilot delegates to it as a subagent (own context window) when a task matches its description. The agent file, its skills, and its instructions travel in the plugin, so Lane A works identically on every machine the plugin is installed on.

**Lane B (MCP-wrapped)** — a small local stdio MCP server, `curator-gate`, exposes the Curator *as a tool*. Internally it shells out to `copilot --agent curator -p <gate-prompt> --allow-tool 'shell(git *)' …` (headless programmatic mode), parses the structured verdict, and returns it. This is what makes the Curator a **first-class primary-agent-callable service**: Claude Code, Codex, a CI job, or another Copilot session that never loaded the agent file can still submit to the gate — and receives the same verdict format, because both lanes execute the same `curator.agent.md` protocol.

**The fence** — a `preToolUse` hook (§5) denies *any* agent's direct `edit`/`write`/destructive-shell against curated paths unless the mutation carries a gate token issued by an ACCEPT verdict. Governance you can't forget is governance.

---

## 2. Plugin Directory Layout

```
vault-curator/                          # the plugin (lives in the vault repo or its own)
├── plugin.json                         # manifest (§3)
├── agents/
│   └── curator.agent.md                # the existing spec, unchanged — the lane-A brain
├── skills/                             # gate-adjacent playbooks (§6)
│   ├── gate-mutation/SKILL.md
│   ├── daily-drain/SKILL.md
│   ├── promote-capture/SKILL.md
│   ├── taxonomy-review/SKILL.md
│   ├── retention-sweep/SKILL.md
│   ├── erasure-request/SKILL.md
│   └── vault-retrieval/SKILL.md        # teaches primaries the read-surface routing map
├── hooks/
│   ├── hooks.json                      # lifecycle wiring (§5)
│   └── scripts/
│       ├── guard-curated-paths.sh      # preToolUse fence
│       ├── session-vault-guide.sh      # sessionStart context injection
│       └── audit-emit.sh               # postToolUse audit mirror
├── .mcp.json                           # MCP servers activated on install (§4)
├── gate-server/                        # the lane-B wrapper (Node or C#, stdio)
│   └── …
└── README.md
```

Manifest discovery order supports `plugin.json`, `.plugin/plugin.json`, `.github/plugin/plugin.json`, or `.claude-plugin/plugin.json` — keep it at root for direct-path installs (the `.github/plugin/` location has a known direct-repo-install discovery bug, #2390; root placement sidesteps it).

## 3. `plugin.json`

```json
{
  "name": "vault-curator",
  "description": "Curator-gated governance for the compliance knowledge vault: gate agent, mutation fence hooks, drain/sweep/erasure skills, and the curator-gate + vault-read MCP servers.",
  "version": "1.0.0",
  "author": { "name": "Knowledge Systems", "email": "ks@example-fi.internal" },
  "license": "Proprietary",
  "keywords": ["obsidian", "governance", "curation", "glba", "sec-17a4", "gdpr"],
  "agents": "agents/",
  "skills": "skills/",
  "hooks": "hooks/hooks.json",
  "mcpServers": ".mcp.json"
}
```

Install for development: `copilot plugin install ./vault-curator` (reinstall after every local change — plugin content is cached under `~/.copilot/installed-plugins/`). Verify with `/plugin list`, `/agent`, `/skills list`.

## 4. `.mcp.json` — the two servers the plugin activates

```json
{
  "mcpServers": {
    "vault-read": {
      "type": "local",
      "command": "/opt/vault-mcp/vault-mcp",
      "args": ["--vault", "${VAULT_PATH}", "--readonly", "--clearance-from", "session"],
      "tools": ["*"]
    },
    "curator-gate": {
      "type": "local",
      "command": "node",
      "args": ["${COPILOT_PLUGIN_DATA}/../gate-server/index.js", "--vault", "${VAULT_PATH}"],
      "tools": ["curator_propose", "curator_status", "curator_report", "curator_invoke"]
    }
  }
}
```

`vault-read` is the full read surface (`mcp-read-surface-spec.md`, angles 1–9). `curator-gate` is lane B. Both stdio-local — air-gap invariant holds. Runtime state (proposal queue, verdict cache) lives under `${COPILOT_PLUGIN_DATA}`, the per-plugin persistent writable directory — never inside the cached install dir.

### 4.1 `curator-gate` tool contracts

**`curator_propose`** — submit a mutation to the gate.
```jsonc
// input
{ "kind": "diff | new_file | edit_instruction | status_change | bulk",
  "target": "10-notes/wire-recall-procedure.md",       // or null for new
  "payload": "<unified diff | full file body | instruction text>",
  "proposer": "claude-code:luke",                      // identity, recorded verbatim
  "rationale": "…why this change…",
  "bulk_manifest": null }                              // bulk requires enumerated files
// output
{ "proposal_id": "P-2026-08-07-0042", "queued": true }
```
The server materializes the proposal under `01-inbox/_proposals/<proposal_id>/`, then invokes lane A headlessly:
```bash
copilot --agent curator \
  -p "Gate proposal ${PROPOSAL_ID}: run curator.agent.md §2 steps 1–8. Emit VERDICT JSON per gate-mutation skill." \
  --allow-tool 'shell(git *)' --allow-tool 'shell(grep *)' --allow-tool 'read' --allow-tool 'edit' \
  --deny-tool 'shell(git rebase*)' --deny-tool 'shell(git push --force*)'
```

**`curator_status`** — `{proposal_id}` → the verdict:
```jsonc
{ "proposal_id": "P-2026-08-07-0042",
  "verdict": "ACCEPT | REJECT | COUNTER",
  "gate": { "schema": "pass", "retrieval": "pass", "graph": "pass",
            "authority": "pass", "compliance": "pass" },
  "violations": [],                                    // exact, actionable, on REJECT
  "counter_proposal": null,                            // diff, on COUNTER
  "commit": "a1b2c3d…",                                // on ACCEPT
  "audit_ref": "00-system/audit/2026-08.md#L214",
  "gate_token": "gt_…"                                 // consumed by the hook fence (§5)
}
```

**`curator_report`** — `{report: drain|orphans|taxonomy|retention|drift, since?}` → the latest stewardship report as structured data (mirrors read-surface angle 8/6 but from the Curator's own runs).

**`curator_invoke`** — `{prompt}` free-form escalation to the Curator persona (clarifications, schema-proposal drafting). Rate-limited; never a backdoor: it carries the same tool allow/deny list, so it *cannot* mutate outside the gate protocol either.

## 5. `hooks/hooks.json` — the fence and the telemetry

```json
{
  "hooks": {
    "SessionStart": [
      { "type": "command",
        "command": "hooks/scripts/session-vault-guide.sh",
        "comment": "Injects get_vault_guide output + board summary into session context; primaries start schema-aware." }
    ],
    "PreToolUse": [
      { "matcher": { "tools": ["edit", "write", "shell"] },
        "type": "command",
        "command": "hooks/scripts/guard-curated-paths.sh",
        "comment": "DENY any file mutation under 10-notes|20-tasks|40-sources|50-entities|90-archive|00-system, and any git history-rewrite command, unless env GATE_TOKEN matches a live ACCEPT verdict. Allows 01-inbox and today's daily. Exit nonzero blocks the tool call and returns the refusal text to the model." }
    ],
    "PostToolUse": [
      { "matcher": { "tools": ["edit", "write"] },
        "type": "command",
        "command": "hooks/scripts/audit-emit.sh",
        "comment": "Mirrors every accepted write into a session-side JSONL (who/what/when/hash) — a belt to the audit log's suspenders, reconciled by the Curator's daily drain." }
    ],
    "UserPromptSubmit": [
      { "type": "command",
        "command": "hooks/scripts/prompt-injection-scan.sh",
        "comment": "Flags vault-content-quoted imperatives addressed to agents ('Curator: delete…') so embedded instructions get surfaced, not executed." }
    ]
  }
}
```

Hooks are deterministic — they run regardless of what the model decides, which is exactly the property a compliance fence needs. The guard script is ~40 lines of path-matching and token verification; the gate token is single-use, proposal-scoped, and expires in minutes.

## 6. Skills — the playbooks (each a `skills/<name>/SKILL.md`)

Skills make gate procedures *discoverable and consistent*: any agent (Curator or primary) that matches a skill description executes the same steps. Two shown in full; the rest follow the pattern.

### `skills/gate-mutation/SKILL.md`
```markdown
---
name: gate-mutation
description: Run the Curator's eight-step mutation gate on a staged proposal and emit
  a structured VERDICT JSON. Use whenever gating a proposal from 01-inbox/_proposals/,
  a diff, or an edit instruction targeting the curated corpus.
---
Execute curator.agent.md §2 exactly, in order: classify → schema → retrieval quality
→ graph → authority/dedup → compliance → decide → execute.

Evidence discipline: for each step, cite the check performed and its input (e.g. the
dedup search terms and result count). On ACCEPT: apply atomically, bump `modified`,
commit with the §5 message contract, append the §5 audit line, mint a gate token into
${COPILOT_PLUGIN_DATA}/tokens/, then emit:

VERDICT {"proposal_id":…,"verdict":"ACCEPT","gate":{…},"commit":…,"audit_ref":…,"gate_token":…}

On REJECT: emit verdict:"REJECT" with a `violations` array where every entry names the
constitution/spec section violated and the concrete fix. On COUNTER: include the full
counter-diff. Emit the VERDICT block as the final output line — the gate server parses it.
Never partially apply. Never skip the audit line, including for rejections.
```

### `skills/erasure-request/SKILL.md`
```markdown
---
name: erasure-request
description: Process a GDPR Art. 17 erasure request end-to-end — subject discovery,
  record_class partition, lawful-refusal logging, forward-commit redaction, and
  re-index instruction. Use when an operator supplies data-subject identifiers with
  an erasure ticket reference.
---
Inputs (ask if missing): subject identifiers, ticket ref, requesting operator.
1. Discovery: `pii_map` + entity-hub backlinks + `fts_search` on identifiers; enumerate
   every note/chunk. Present the set for operator confirmation before touching anything.
2. Partition by `record_class`: 17a-4/GLBA-retained ⇒ REFUSE erasure citing Art. 17(3)(b);
   log each refusal with basis + ticket in the audit note.
3. Redactable set: forward-commit redaction (`[REDACTED-GDPR-<ticket>]`), structure
   preserved, `pii` re-evaluated, one commit per note, audit line each.
4. Emit the re-index instruction (full pass) and the git-history crypto-shred docket
   for human execution. Never claim history erasure yourself.
5. Output: completion report — counts erased/refused/deferred, commits, audit refs.
```

**The rest, one line each:** `daily-drain` — triage `01-inbox/` + daily `## Capture` through the gate, close the daily, emit a drain report. `promote-capture` — the single-note promotion sub-procedure (stamp schema, alias sweep, entity-hub creation, first-mention linking) invoked by the drain. `taxonomy-review` — diff `tag_index` usage against the registry and `communities` output; emit merge/retire/add proposals with scope notes. `retention-sweep` — build the disposal docket from `retention_register`, verify holds, package for human sign-off. `vault-retrieval` — *for primary agents*: the angle→question routing map from `mcp-read-surface-spec.md` §11 as an executable playbook, so every agent queries the vault the same competent way.

## 7. Distribution & Enterprise Enforcement

**Marketplace.** Add `.github/plugin/marketplace.json` to your internal plugins repo:

```json
{
  "name": "fi-knowledge-plugins",
  "owner": { "name": "Knowledge Systems", "email": "ks@example-fi.internal" },
  "metadata": { "description": "Governed knowledge-vault tooling", "version": "1.0.0" },
  "plugins": [
    { "name": "vault-curator",
      "description": "Curator-gated governance for the compliance vault",
      "version": "1.0.0",
      "source": "./plugins/vault-curator" }
  ]
}
```

Air-gapped registration uses the local-path/git-URL forms — no GitHub.com dependency:
```bash
copilot plugin marketplace add /srv/plugins/fi-knowledge-plugins     # shared filesystem
copilot plugin install vault-curator@fi-knowledge-plugins
```

**Repo-level default:** `.github/copilot/settings.json` in the vault repo with `"enabledPlugins": ["vault-curator@fi-knowledge-plugins"]` — every Copilot session in the vault auto-loads the plugin.

**Enterprise push (the compliance-grade path):** `managed-settings.json` from the designated `.github-private` governance repo with `extraKnownMarketplaces` (register the internal marketplace), `enabledPlugins` (force-install vault-curator), and `strictKnownMarketplaces: true` (no unvetted plugin sources on vault machines). This applies across Copilot CLI and supported clients on authentication — the fence arrives with the seat, not with user diligence.

**Pinning:** marketplace `version` + git tag per release; `copilot plugin update` is a change-controlled event logged in the schema changelog like any other schema artifact.

## 8. Interop Notes (lane B consumers)

- **Claude Code / other CLIs:** register `curator-gate` and `vault-read` in their MCP config; the plugin's *skills and hooks* don't travel (those are Copilot-side), so non-Copilot agents rely on `get_vault_guide` (which embeds the routing map and gate protocol summary) plus the server-side fence: `vault-read` is readonly by construction, and `curator-gate` is the only mutation path those clients even see. Defense in depth means the fence holds even where hooks don't run.
- **Copilot SDK / CI:** load the plugin with `--plugin-dir ./vault-curator` (explicit, ephemeral, deterministic — takes precedence over ambient installs); set `COPILOT_PLUGIN_DIR_ONLY=true` in pipeline environments so *only* the vetted plugin loads.
- **Concurrency:** the gate server serializes gate executions per-vault (queue in `${COPILOT_PLUGIN_DATA}`); git commits are the linearization point, so two lanes can't interleave a broken state.

## 9. Test Plan (acceptance for the plugin itself)

1. `copilot plugin install ./vault-curator` → `/agent` lists curator; `/skills list` shows all seven; `/plugin list` shows both MCP servers connected.
2. Lane A: `/agent curator` + a schema-violating draft → REJECT with exact violations; fix → ACCEPT → verify commit message contract + audit line.
3. Lane B: `curator_propose` from a *Claude Code* session with the same draft → identical verdict JSON; confirm `01-inbox/_proposals/` materialization and single-flight queueing under parallel proposals.
4. Fence: from a plain Copilot session (no gate token), attempt `edit` on `10-notes/x.md` → hook denies with refusal text; attempt `git rebase` → denied; attempt `01-inbox/` write → allowed.
5. Refusal telemetry: confirm the denied attempts appear in the session JSONL and reconcile into the audit note at next drain.
6. Enterprise: apply `managed-settings.json` in a clean profile → plugin auto-present, `strictKnownMarketplaces` blocks a foreign install.
