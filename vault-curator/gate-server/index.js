#!/usr/bin/env node
// curator-gate — lane B: the Curator as a first-class MCP tool.
// Hand-rolled stdio JSON-RPC (zero deps; four tools don't justify an SDK).
// Wraps `copilot --agent curator -p …` headlessly; serializes gate runs per vault.
//
// Usage: node index.js -v|--vault <path> [--copilot <bin>] [--dry-run]

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

function usage() {
  console.error(`Usage: node index.js -v|--vault <path> [options]
  -v, --vault <path>    vault root (required)
      --copilot <bin>   copilot binary (default: copilot)
      --dry-run         gate without invoking copilot (verdict: QUEUED only; CI/testing)
  -h, --help            this text`);
  process.exit(2);
}
const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "-v" || a === "--vault") opts.vault = argv[++i];
  else if (a === "--copilot") opts.copilot = argv[++i];
  else if (a === "--dry-run") opts.dryRun = true;
  else if (a === "-h" || a === "--help") usage();
  else usage();
}
if (!opts.vault) usage();
const VAULT = path.resolve(opts.vault);
const COPILOT = opts.copilot ?? "copilot";
const DATA = process.env.COPILOT_PLUGIN_DATA ?? path.join(process.env.HOME ?? "/tmp", ".copilot", "plugin-data", "vault-curator");
const TOKENS = path.join(DATA, "tokens");
const QUEUE = path.join(DATA, "proposals");
for (const d of [DATA, TOKENS, QUEUE]) fs.mkdirSync(d, { recursive: true });

// ---------- proposal store ----------
let seq = fs.readdirSync(QUEUE).length;
function newProposalId() {
  return `P-${new Date().toISOString().slice(0, 10)}-${String(++seq).padStart(4, "0")}`;
}
const pfile = (id) => path.join(QUEUE, `${id}.json`);
function loadProposal(id) {
  try { return JSON.parse(fs.readFileSync(pfile(id), "utf8")); } catch { return null; }
}
function saveProposal(p) { fs.writeFileSync(pfile(p.proposal_id), JSON.stringify(p, null, 1)); }

// ---------- single-flight gate execution (git commits are the linearization point) ----------
let gateChain = Promise.resolve();
function runGate(proposal) {
  gateChain = gateChain.then(() => executeGate(proposal)).catch(() => {});
  return gateChain;
}

async function executeGate(p) {
  // materialize under 01-inbox/_proposals/<id>/ — inside the free-write zone by design
  const dir = path.join(VAULT, "01-inbox", "_proposals", p.proposal_id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "proposal.json"), JSON.stringify(p, null, 1));
  if (p.payload) fs.writeFileSync(path.join(dir, "payload.txt"), p.payload);

  if (opts.dryRun) {
    p.state = "queued-dry-run";
    saveProposal(p);
    return;
  }
  const prompt = `Gate proposal ${p.proposal_id}: run curator.agent.md §2 steps 1–8 on the proposal staged at 01-inbox/_proposals/${p.proposal_id}/. Emit VERDICT JSON per the gate-mutation skill as the final output line.`;
  const args = ["--agent", "curator", "-p", prompt,
    "--allow-tool", "shell(git *)", "--allow-tool", "shell(grep *)",
    "--allow-tool", "read", "--allow-tool", "edit",
    "--deny-tool", "shell(git rebase*)", "--deny-tool", "shell(git push --force*)",
    "--deny-tool", "shell(git commit --amend*)"];
  const out = await new Promise((resolve) => {
    const child = spawn(COPILOT, args, { cwd: VAULT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve({ stdout, stderr, timeout: true }); }, 10 * 60 * 1000);
    child.on("close", () => { clearTimeout(timer); resolve({ stdout, stderr }); });
    child.on("error", (e) => { clearTimeout(timer); resolve({ stdout, stderr: String(e), spawnError: true }); });
  });
  // parse the final VERDICT line
  const m = /VERDICT\s+(\{[\s\S]*\})\s*$/m.exec(out.stdout ?? "");
  if (m) {
    try {
      const v = JSON.parse(m[1]);
      p.state = "decided";
      p.verdict = v;
      if (v.verdict === "ACCEPT") {
        const token = "gt_" + randomBytes(18).toString("base64url");
        fs.writeFileSync(path.join(TOKENS, token), p.proposal_id);
        p.verdict.gate_token = token;
      }
    } catch (e) { p.state = "error"; p.error = `verdict parse failed: ${e.message}`; }
  } else {
    p.state = "error";
    p.error = out.spawnError ? `copilot spawn failed: ${out.stderr}`
      : out.timeout ? "gate execution timed out (10m)"
      : `no VERDICT block in curator output (stderr: ${String(out.stderr).slice(0, 400)})`;
  }
  saveProposal(p);
}

// ---------- the four tools ----------
const TOOLS = [
  {
    name: "curator_propose",
    description: "Submit a mutation proposal (diff | new_file | edit_instruction | status_change | bulk) into the Curator gate. Returns proposal_id; poll curator_status for the verdict. The ONLY mutation path on this server.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      required: ["kind", "payload", "proposer", "rationale"],
      properties: {
        kind: { type: "string", enum: ["diff", "new_file", "edit_instruction", "status_change", "bulk"] },
        target: { type: ["string", "null"], description: "vault-relative path, or null for new" },
        payload: { type: "string", description: "unified diff | full file body | instruction text" },
        proposer: { type: "string", description: "identity, recorded verbatim" },
        rationale: { type: "string" },
        bulk_manifest: { type: ["array", "null"], items: { type: "string" }, description: "required when kind=bulk: enumerated files" },
      },
    },
    handler: async (a) => {
      if (a.kind === "bulk" && !Array.isArray(a.bulk_manifest))
        return { error: "bulk requires an enumerated bulk_manifest (curator.agent.md §6.3)" };
      const p = { proposal_id: newProposalId(), state: "queued", submitted: new Date().toISOString(), ...a };
      saveProposal(p);
      runGate(p); // async; single-flight
      return { proposal_id: p.proposal_id, queued: true };
    },
  },
  {
    name: "curator_status",
    description: "Gate verdict for a proposal_id: ACCEPT (with commit + audit_ref + gate_token) | REJECT (with exact violations) | COUNTER (with counter-proposal) | still queued.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", required: ["proposal_id"], properties: { proposal_id: { type: "string" } } },
    handler: async (a) => {
      const p = loadProposal(a.proposal_id);
      if (!p) return { error: `unknown proposal_id: ${a.proposal_id}` };
      if (p.state !== "decided") return { proposal_id: p.proposal_id, state: p.state, error: p.error ?? undefined };
      return { proposal_id: p.proposal_id, ...p.verdict };
    },
  },
  {
    name: "curator_report",
    description: "Latest stewardship reports (drain | orphans | taxonomy | retention | drift) from the Curator's own runs, as structured data.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object", required: ["report"],
      properties: { report: { type: "string", enum: ["drain", "orphans", "taxonomy", "retention", "drift"] }, since: { type: "string" } },
    },
    handler: async (a) => {
      const dir = path.join(DATA, "reports");
      const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => f.startsWith(a.report + "-")).sort().reverse() : [];
      const latest = files.find((f) => !a.since || f >= `${a.report}-${a.since}`) ?? files[0];
      if (!latest) return { report: a.report, available: false, note: "no report of this kind yet — the Curator writes them under ${COPILOT_PLUGIN_DATA}/reports/ on each stewardship run" };
      return { report: a.report, file: latest, data: JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8")) };
    },
  },
  {
    name: "curator_invoke",
    description: "Free-form escalation to the Curator persona (clarifications, schema-proposal drafting). Rate-limited; carries the same tool allow/deny list — it cannot mutate outside the gate protocol.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: { type: "object", required: ["prompt"], properties: { prompt: { type: "string" } } },
    handler: rateLimited(async (a) => {
      if (opts.dryRun) return { response: "(dry-run) curator not invoked", prompt: a.prompt };
      const out = await new Promise((resolve) => {
        const child = spawn(COPILOT, ["--agent", "curator", "-p", a.prompt,
          "--allow-tool", "shell(git *)", "--allow-tool", "shell(grep *)", "--allow-tool", "read",
          "--deny-tool", "edit", "--deny-tool", "write"], { cwd: VAULT, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        child.stdout.on("data", (d) => (stdout += d));
        const t = setTimeout(() => { child.kill("SIGKILL"); resolve(stdout + "\n[timeout]"); }, 5 * 60 * 1000);
        child.on("close", () => { clearTimeout(t); resolve(stdout); });
        child.on("error", (e) => { clearTimeout(t); resolve(`[spawn error: ${e.message}]`); });
      });
      return { response: out };
    }),
  },
];

function rateLimited(fn, perMinute = 6) {
  const calls = [];
  return async (a) => {
    const now = Date.now();
    while (calls.length && now - calls[0] > 60000) calls.shift();
    if (calls.length >= perMinute) return { error: `rate-limited: max ${perMinute}/min` };
    calls.push(now);
    return fn(a);
  };
}

// ---------- stdio JSON-RPC loop ----------
const rl = readline.createInterface({ input: process.stdin });
const write = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const reply = (result) => req.id != null && write({ jsonrpc: "2.0", id: req.id, result });
  const fail = (code, message) => req.id != null && write({ jsonrpc: "2.0", id: req.id, error: { code, message } });
  try {
    switch (req.method) {
      case "initialize":
        reply({ protocolVersion: req.params?.protocolVersion ?? "2024-11-05",
          capabilities: { tools: {} }, serverInfo: { name: "curator-gate", version: "1.0.0" } });
        break;
      case "notifications/initialized": break;
      case "ping": reply({}); break;
      case "tools/list":
        reply({ tools: TOOLS.map(({ handler, ...t }) => t) });
        break;
      case "tools/call": {
        const tool = TOOLS.find((t) => t.name === req.params?.name);
        if (!tool) { fail(-32602, `unknown tool: ${req.params?.name}`); break; }
        const result = await tool.handler(req.params?.arguments ?? {});
        reply({ content: [{ type: "text", text: JSON.stringify(result, null, 1) }], isError: !!result?.error });
        break;
      }
      default: fail(-32601, `method not found: ${req.method}`);
    }
  } catch (e) { fail(-32603, e.message ?? String(e)); }
});
console.error(`curator-gate 1.0.0 · vault=${VAULT} · data=${DATA} · dryRun=${!!opts.dryRun}`);
