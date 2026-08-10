# DEPLOY — running P4 on the target machine

The operator runbook for standing up the governed vault on a fresh, air-gapped machine. Everything here is executable; nothing assumes network access at deploy time.

## Prerequisites (target machine)

- **Node ≥ 24** (the MCP server uses the built-in `node:sqlite`; no native modules, no `npm install` needed on the target — the server ships as a committed single-file bundle).
- **git**, **Obsidian**, and **GitHub Copilot CLI** (`copilot`) installed.
- This kit repo, cloned or copied to an absolute path (call it `$KIT`).

> If you build the bundle yourself instead of using the committed one:
> `cd vault-mcp && npm install && npm run build` (needs network once, on a build box).
> The result `vault-mcp/bin/vault-mcp.mjs` is what ships.

## One-time verification on the kit (optional but recommended)

```bash
cd $KIT/vault-mcp && npm run typecheck && node smoke.mjs           # 27/27
cd $KIT/vault-curator && ./test-plugin.sh                          # 29/29
```

## Step 1 — instantiate the vault

```bash
$KIT/deploy/init-vault.sh --target /abs/path/to/vault
```

Creates the §8 folder tree, extracts templates, seeds the schema files (tag registry, changelog, retention rules), copies the bases and agent/hook registrations, writes the `.obsidian` core-plugin config, and makes the git epoch commit tagged `v1.0.0-initial-state`. Refuses a non-empty target unless `--force`.

## Step 2 — wire the servers + fence

```bash
$KIT/deploy/install-plugin.sh --vault /abs/path/to/vault --clearance internal
# add --dev to also `copilot plugin install ./vault-curator`
```

Writes `.mcp.json` with **absolute** paths (Copilot CLI does not expand `${VAR}`). The repo-level fence at `.github/hooks/` is copied into the vault by Step 1 and is active **regardless** of whether plugin-defined hooks fire (copilot-cli#2540) — this is the load-bearing guarantee.

### Choose ONE activation path (never both)

- **Plugin path** (Copilot-native): `install-plugin.sh --dev`, or enterprise marketplace (`marketplace.json` + `managed-settings.json`). Gives you Lane A subagent delegation + skills.
- **Repo-level path** (any MCP client, incl. Claude Code): the `.github/hooks/` fence + `.mcp.json` servers, no plugin install. The curator agent is available via `.github/agents/curator.agent.md`.

Running both registers the `curator` agent twice — pick one.

## Step 3 — Obsidian

Open the vault. Community plugins (vendored offline per manual §7): Templater, Bases kanban view, obsidian-git. Enable them, point Templater at `00-system/templates`, confirm the kanban base renders. The `.obsidian/*.json` seeds from Step 1 pre-set core plugins, daily-notes, and templates folders.

## Step 4 — scheduled stewardship (C-class workflows)

Event hooks cover the mutation gate; cadence runs need a scheduler:

```bash
$KIT/deploy/schedule/install-cron.sh --vault /abs/path/to/vault --print   # review first
$KIT/deploy/schedule/install-cron.sh --vault /abs/path/to/vault           # install
```

Installs daily drain, weekly orphan/graph/drift audits, monthly taxonomy + retention sweeps — each a headless, plugin-scoped Curator/steward invocation.

## Step 5 — post-accept re-index (W22)

`init-vault` installs a git `post-commit` hook in the vault that pokes the MCP server to re-scan after each accepted mutation. If you run the server as a long-lived process, restart-on-commit is handled; for on-demand server starts it's a no-op (the server scans on boot).

## Acceptance checks (do these before trusting the vault)

```bash
# 1. fence holds — from inside the vault, a direct curated write must be denied:
echo '{"toolName":"edit","toolArgs":{"path":"10-notes/x.md"}}' \
  | VAULT_PATH=/abs/path/to/vault .github/hooks/scripts/guard-curated-paths.sh
#   → {"permissionDecision":"deny", ...}

# 2. server answers — list tools / read the guide:
node $KIT/vault-mcp/bin/vault-mcp.mjs --vault /abs/path/to/vault --clearance internal
#   (then speak MCP, or just confirm it prints the boot line and stays up)

# 3. schema is clean — schema_drift must be empty on the fresh vault.
# 4. gate round-trips — curator_propose a trivial note; expect ACCEPT with a commit + audit line.
```

## Known constraints (by design, not defects)

- **Semantic/dense retrieval is degraded** — no local embedding model ships (the target machine bans local model weights). `search` runs sparse + lexical fallback and reports `status: degraded`. To enable dense recall, deploy an embedder on a disk-capable machine and pass `--embedder onnx:<path>` in `.mcp.json`.
- **Plugin preToolUse hooks may not fire** on some Copilot CLI versions (#2540) — this is why the fence is mirrored at `.github/hooks/`. Verify acceptance check #1 on your CLI version; if the repo-level hook also doesn't fire, escalate the fence to a policy-level hook source (`/etc/github-copilot/policy.d/`) before trusting the vault with regulated content.
