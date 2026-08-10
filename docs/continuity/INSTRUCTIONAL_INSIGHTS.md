# INSTRUCTIONAL INSIGHTS (append-only)

## 2026-08-10

- **Spec-vs-machine-constraint conflicts: resolve in config, never in scope.**
  Spec demanded local ONNX embeddings; machine bans local models. Pluggable
  interface + honest degraded envelopes satisfied both without descoping — and the
  envelope's `recommendations` field turns the limitation into an actionable message.
  Pattern generalizes: implement the full surface, gate the expensive backend.
- **Verify hook schemas against the platform reference before building.** The
  curator-plugin-spec's hooks sketch was plausible and wrong (pre-GA). One WebFetch
  of the hooks-reference saved a broken fence. Specs drift; platform docs are truth.
- **Nested git repos in fixtures: generate, don't track.** A fixture needing its own
  history becomes a gitlink landmine. `make-fixture.sh` + base64 tar payload keeps
  the corpus reviewable-ish, regenerable, and out of the index.
- **bash pipeline subshells eat counters.** `cmd | expect_fn` increments in a
  subshell → 0/0 at exit. Count via results file (tee -a), not shell variables.
- **Zero-dep JSON-RPC beats SDK for tiny MCP servers.** 4-tool gate-server =
  ~100 lines of readline loop; no node_modules in the plugin, no install step,
  identical wire behavior. SDK earns its place at ~40 tools (vault-mcp).
- **Test clearance tiers as first-class matrix.** Running one smoke suite at
  public/internal/restricted caught "failures" that were actually R2 working —
  expectations must be clearance-parameterized, or security features read as bugs.
- **Deterministic-guarantee classification (H/G/S/C) clarifies governance design:**
  hooks guarantee the mechanical; gates take judgment but hooks guarantee *arrival*
  at the gate; skills guide the optional; cadences need a scheduler (name that gap
  explicitly or it silently becomes "someone remembers to run it").
