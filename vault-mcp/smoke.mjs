#!/usr/bin/env node
// Smoke test: drives vault-mcp over stdio JSON-RPC against test-fixture.
// Usage: node smoke.mjs [-c <clearance>]
import { spawn } from "node:child_process";
import assert from "node:assert";

const clearance = process.argv.includes("-c") ? process.argv[process.argv.indexOf("-c") + 1] : "restricted";
// Default to the SHIPPED artifact (the committed bundle operators actually run),
// so `npm test` exercises it and passes on a fresh air-gapped clone (audit R2).
// Override with SMOKE_ENTRY=dist/index.js to test the raw tsc output.
const entry = process.env.SMOKE_ENTRY ?? "bin/vault-mcp.mjs";
const srv = spawn("node", [entry, "--vault", "test-fixture", "--clearance", clearance], { stdio: ["pipe", "pipe", "inherit"] });

let buf = "";
const pending = new Map();
srv.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((res, rej) => {
    pending.set(id, res);
    setTimeout(() => rej(new Error(`timeout: ${method}`)), 10000);
  });
}
const call = async (name, args = {}) => {
  const r = await rpc("tools/call", { name, arguments: args });
  if (r.error) throw new Error(`${name}: ${JSON.stringify(r.error)}`);
  return JSON.parse(r.result.content[0].text);
};

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); if (!ok) process.exitCode = 1; };

try {
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } });
  srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const tools = (await rpc("tools/list", {})).result.tools;
  check("tool-count>=38", tools.length >= 38, `got ${tools.length}`);
  check("all-readonly-annotated", tools.every((t) => t.annotations?.readOnlyHint === true));

  if (clearance === "public") {
    // whole fixture is internal+ — R2 must hide everything
    const r = await call("resolve", { name: "wire recall" });
    check("public-sees-nothing", (r.hits ?? []).length === 0, JSON.stringify(r.hits));
    const rn = await call("read_note", { ref: "01J0000000000000000000WIRE" });
    check("public-note-redacted", rn.redacted === true, JSON.stringify(rn));
    const f = await call("fts_search", { query: "wire" });
    check("public-fts-redacted-stubs-only", (f.hits ?? []).every((h) => h.redacted === true), JSON.stringify(f.hits?.slice(0, 2)));
    throw new Error("__public_done__");
  }

  const res = await call("resolve", { name: "wire recall" });
  check("resolve", res.hits?.[0]?.title === "wire-recall-procedure", JSON.stringify(res.hits?.[0]?.title));

  const note = await call("read_note", { ref: "01J0000000000000000000WIRE" });
  check("read_note-by-id", note.title === "wire-recall-procedure" && note.body.includes("Cutoff"));

  const sec = await call("read_section", { ref: "01J0000000000000000000WIRE", heading_path: "Wire Recall Procedure::Cutoff Times" });
  check("read_section", (sec.fragment ?? "").includes("16:30"));

  const fts = await call("fts_search", { query: "NACHA return" });
  check("fts_search", fts.hits?.some((h) => h.id === "01J0000000000000000000ACHR"), JSON.stringify(fts.hits?.map((h) => h.title)));

  const srch = await call("search", { query: "how do I recall a wire transfer" });
  check("hybrid-search", srch.hits?.[0]?.id === "01J0000000000000000000WIRE", srch.strategy);
  check("hybrid-degraded-honest", srch.status === "degraded" || srch.strategy.includes("sparse"), `${srch.status}/${srch.strategy}`);

  const bl = await call("backlinks", { ref: "ACH Return Codes" });
  check("backlinks-context", bl.links?.some((l) => l.edges?.some((e) => e.context?.includes("upstream signal"))), JSON.stringify(bl.links));

  const pb = await call("path_between", { ref_a: "wire recall", ref_b: "ACH Return Codes" });
  check("path_between", pb.paths?.length > 0 && pb.paths[0].hops >= 1);

  const cn = await call("central_notes", { metric: "degree" });
  check("central_notes", cn.ranked?.length > 0);

  const bd = await call("board", {});
  check("board-kanban", bd.groups?.doing?.some((c) => c.title === "update-wire-runbook"), JSON.stringify(Object.keys(bd.groups ?? {})));

  // R2: retained rows visible scale with clearance (internal hides confidential+restricted)
  const rr = await call("retention_register", {});
  // restricted sees all record_class≠none incl. the draft-glba edge case (#13); internal hides confidential+
  const expectRows = clearance === "restricted" ? 5 : clearance === "confidential" ? 4 : 2;
  check("retention_register-clearance", rr.rows?.length === expectRows, `rows=${rr.rows?.length} expected=${expectRows}`);

  const hs = await call("hold_set", {});
  const holdVisible = clearance === "restricted" || clearance === "confidential";
  check("hold_set-clearance", JSON.stringify(hs.holds).includes("01J0000000000000000000REGE") === holdVisible);

  const drift = await call("schema_drift", {});
  const kinds = (drift.violations ?? []).map((v) => v.kind);
  check("schema_drift-unresolved-link", kinds.includes("unresolved-link"), JSON.stringify(kinds)); // [[Reg E...]] body link resolves; [[Payments Operations]] resolves; none unresolved? see detail

  const hist = await call("note_history", { ref: "01J0000000000000000000WIRE" });
  check("note_history-contract", hist.history?.[0]?.curator_verb === "create" && hist.history?.[0]?.gate_summary?.includes("schema=pass"));

  const asof = await call("record_as_of", { ref: "01J0000000000000000000WIRE", sha: hist.history[0].sha });
  check("record_as_of", asof.content?.includes("Cutoff Times"));

  const prov = await call("provenance", { ref: "01J0000000000000000000WIRE" });
  check("provenance", prov.verified === true && prov.sources?.[0]?.doc_hash === "abc123def456");

  const sem = await call("semantic_search", { query: "recalling outbound payments" });
  check("semantic-degraded", sem.status === "degraded" && sem.recommendations?.length > 0);

  const tq = await call("task_query", { status: ["doing"] });
  check("task_query", tq.rows?.[0]?.id === "01J0000000000000000000TSK1");

  const ti = await call("tag_index", { prefix: "#domain" });
  check("tag_index-rollup", ti.tags?.some((t) => t.tag === "#domain/payments" && t.count >= 3), JSON.stringify(ti.tags));

  // clearance enforcement: run key checks only meaningful at restricted
  if (clearance === "restricted") {
    const pii = await call("pii_map", {});
    check("pii_map-restricted", pii.rows?.some((r) => r.id === "01J0000000000000000000JANE"));
  } else {
    const pii = await call("pii_map", {});
    check("pii_map-gated", pii.status === "error");
    const rege = await call("read_note", { ref: "01J0000000000000000000REGE" });
    check("clearance-redaction", rege.redacted === true, JSON.stringify(rege));
  }

  const guide = await call("get_vault_guide", {});
  check("vault_guide", !!guide.constitution && guide.routing_map?.length >= 10);

  // --- compliance-correctness regressions (audit batch C) ---
  // #12: legal_hold:"true" (string) must register as held
  if (clearance === "restricted" || clearance === "confidential") {
    const held = await call("hold_set", {});
    check("truthy-string-hold", JSON.stringify(held.holds).includes("01J0000000000000000000DFT1"), "legal_hold:'true' string must hold");
    // #13: draft glba-npi note must appear in the retention register
    const rr2 = await call("retention_register", {});
    check("draft-in-retention", rr2.rows?.some((r) => r.id === "01J0000000000000000000DFT1"), "draft record must be inventoried");
  }
  // #11: typo'd classification ("Confidental") must fail CLOSED — invisible at internal
  if (clearance === "internal") {
    const typo = await call("read_note", { ref: "01J0000000000000000000TYPO" });
    check("classification-fail-closed", typo.redacted === true, JSON.stringify(typo).slice(0, 80));
  }
  if (clearance === "restricted") {
    const typo = await call("read_note", { ref: "01J0000000000000000000TYPO" });
    check("failclosed-visible-at-restricted", typo.body !== undefined && !typo.redacted);
    // #34: redacted stub carries no path
    const pubHit = (await call("fts_search", { query: "misspelled" })).hits ?? [];
    check("redact-no-path", pubHit.every((h) => !h.redacted || h.path === ""), JSON.stringify(pubHit.slice(0, 1)));
  }
} catch (e) {
  if (e.message !== "__public_done__") check("harness", false, e.message);
} finally {
  srv.kill();
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.ok ? "" : "  ← " + r.detail}`);
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed (clearance=${clearance})`);
