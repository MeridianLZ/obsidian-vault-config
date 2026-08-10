# INSTRUCTIONAL INSIGHTS — Implementation Runbook (append-only)

Reusable lessons from executing P4. Seeded from the proto phase; add as implementation
teaches more. (Proto-phase insights: `docs/proto-implementation/continuity/INSTRUCTIONAL_INSIGHTS.md`.)

## 2026-08-10 (seed — carried forward as operating principles)

- **Deterministic runbook > agent improvisation for deploy.** When a verified script
  exists, the agent's job is to run it and check evidence, not to reason about steps.
  Planning agents add value on open-ended tasks, not on checklists.
- **Evidence before assertions.** Never declare a deploy step or acceptance check
  passed without the command output. GO requires all four checks' outputs in the log.
- **A security control you can't verify on the real target is not yet verified.** The
  fence passed every local probe, but "does it fire on the target CLI" is a distinct
  fact that only the target can answer. Design assumed this (layered fence); the
  operator must still run the check.
