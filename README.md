# Obsidian Compliance Vault Kit

From-scratch Obsidian knowledge-vault system for an air-gapped financial institution
(GLBA · SEC Rule 17a-4 audit-trail alternative · GDPR), with Curator-gated mutations
and templates engineered for semantic, hybrid (sparse+dense), and multi-hop retrieval.

## Contents

| File | Role |
|---|---|
| `00-vault-initial-state.md` | Schema constitution: folders, property registry, tag taxonomy, link conventions, retrieval contract, plugin baseline, compliance mapping |
| `templates/tpl-daily-note.md` | Daily note (Templater — the single JS exception, prev/next nav) |
| `templates/tpl-kanban-card.md` | Note-per-card kanban card (core Templates) |
| `templates/tpl-general-note.md` | Retrieval-maximized atomic knowledge note (core Templates) |
| `bases/kanban-board.base` | Bases-native kanban board + triage/done views |
| `.github/agents/curator.agent.md` | The Curator custom agent — sole mutation gatekeeper |
| `.github/copilot-instructions.md` | Primary-agent house rules (repo-wide) |
| `.github/instructions/vault-mutations.instructions.md` | Path-scoped rules attached to curated-corpus edits |
| `manual/obsidian-zero-to-expert.md` | The operator's manual, Parts I–IX |
| `mcp-read-surface-spec.md` | v2 read surface: every retrieval angle (identity, FTS, semantic, hybrid, graph, analytics, temporal/audit, compliance, kanban) as MCP tool contracts |
| `curator-plugin-spec.md` | Curator packaged as a Copilot CLI plugin: plugin.json, skills, hook fence, curator-gate MCP server (Curator as a tool other agents call), marketplace + enterprise push |

## Install order

1. Read `00-vault-initial-state.md`.
2. Follow manual Parts II (setup) and the spec's §8 checklist.
3. Register the `.github/` files at the vault root.
4. Live in manual Parts IV–VI; graduate through VII–IX.
