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
