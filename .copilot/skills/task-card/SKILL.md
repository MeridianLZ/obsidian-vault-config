---
name: task-card
description: Create or update a kanban task card (20-tasks/ note-per-card) through the
  Curator gate, or read board state. Use when the user says "add a task", "move X to
  doing", "what's on the board", or any kanban card operation.
---
# Task Card

Cards are curated notes (`20-tasks/`) — mutations go through the gate; reads are direct.

**Read board state**: `board` (columns → cards) or `task_query` (triage filters:
`status`, `due_before`, `priority_max`, `stale_days`, `project`).

**Create a card** — `curator_propose`:

```jsonc
{ "kind": "new_file",
  "target": "20-tasks/<kebab-slug>.md",
  "payload": "<full card body per tpl-kanban-card: type: task, summary, status: backlog|todo,
              priority: 1-4, due?, project: [[entity]], order, + universal properties>",
  "proposer": "<agent-id:user>",
  "rationale": "new task card: <one line>" }
```

**Move a card** (status change) — `curator_propose`:

```jsonc
{ "kind": "status_change",
  "target": "20-tasks/<card>.md",
  "payload": "status: doing  # from: todo",
  "proposer": "<agent-id:user>",
  "rationale": "<why the move>" }
```

Poll `curator_status` with the returned `proposal_id`; relay REJECT violations to the
user verbatim (they name the exact fix). Status enum: `backlog · todo · doing ·
blocked · review · done` — nothing else exists.
