#!/usr/bin/env node
// vault-mcp — the full read-surface per mcp-read-surface-spec.md v2.0.0.
// Read-only by construction (R1); clearance fixed at registration (R2); air-gapped (R6).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { VaultIndex, applyFilters, chunkBody, REQUIRED_UNIVERSAL } from "./indexer.js";
import { Graph } from "./graph.js";
import { GitIO } from "./gitio.js";
import { SearchEngine, NoEmbedder } from "./search.js";
import { loadBase, queryBase } from "./bases.js";
import { Envelope, Filters, Hit, NoteRecord, envelope, classRank } from "./types.js";

// ---------- CLI (named args only, per house rules) ----------
function usage(): never {
  console.error(`Usage: vault-mcp -v|--vault <path> [options]
  -v, --vault <path>        vault root (required)
  -r, --readonly            readonly mode (default true; only mode implemented)
  -c, --clearance <level>   public|internal|confidential|restricted (default internal)
  -e, --embedder <spec>     none (default) | onnx:<model-path>
  -d, --db <path>           sqlite path (default :memory:)
  -h, --help                this text`);
  process.exit(2);
}
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const map: Record<string, string> = { "-v": "vault", "--vault": "vault", "-r": "readonly", "--readonly": "readonly",
    "-c": "clearance", "--clearance": "clearance", "-e": "embedder", "--embedder": "embedder",
    "-d": "db", "--db": "db", "-h": "help", "--help": "help" };
  for (let i = 0; i < argv.length; i++) {
    const key = map[argv[i]];
    if (!key) usage();
    if (key === "readonly" || key === "help") out[key] = "true";
    else out[key] = argv[++i] ?? usage();
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
if (args.help || !args.vault) usage();

const VAULT = path.resolve(args.vault);
const CLEARANCE = args.clearance ?? "internal";
if (!["public","internal","confidential","restricted"].includes(CLEARANCE)) usage();

// ---------- state ----------
const idx = new VaultIndex(VAULT, args.db);
idx.scan();
const git = new GitIO(VAULT);
let graph: Graph | null = null;
const graphOf = () => (graph ??= new Graph(idx.edges, idx.notes.keys()));
const engine = new SearchEngine(idx, graphOf, CLEARANCE, NoEmbedder); // onnx embedder: not configured on this deployment

const server = new McpServer({ name: "vault-read", version: "2.0.0" });

// ---------- helpers ----------
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const FilterSchema = z.object({
  type: z.array(z.string()).optional(),
  status: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  folder: z.string().optional(),
  classification_max: z.enum(["public","internal","confidential","restricted"]).optional(),
  record_class: z.array(z.string()).optional(),
  modified_after: z.string().optional(),
  modified_before: z.string().optional(),
  include_drafts: z.boolean().optional(),
  include_archive: z.boolean().optional(),
}).optional();

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 1) }] };
}
function err(strategy: string, message: string) {
  return json(envelope({ status: "error", strategy, diagnostics: { warnings: [message] } }));
}
function findNote(ref: string): NoteRecord | null {
  return idx.notes.get(ref)
    ?? (idx.byPath.has(ref) ? idx.notes.get(idx.byPath.get(ref)!)! : null)
    ?? (idx.byTitle.has(ref.toLowerCase()) ? idx.notes.get(idx.byTitle.get(ref.toLowerCase())!)! : null);
}
function visible(n: NoteRecord): boolean { return classRank(n.classification) <= classRank(CLEARANCE as any); }
/** Serve a note body under R2 pii policy: summary-only unless clearance is restricted. */
function servableBody(n: NoteRecord): string | null {
  if (!visible(n)) return null;
  if (n.pii && CLEARANCE !== "restricted") return null;
  return n.body;
}
function noteMeta(n: NoteRecord) {
  return { id: n.id, path: n.path, title: n.title, type: n.type, status: n.status,
    summary: n.summary, classification: n.classification, tags: n.tags };
}
function tool(name: string, description: string, shape: z.ZodRawShape, cb: (a: any) => any) {
  server.registerTool(name, { description, annotations: RO, inputSchema: shape }, async (a: any) => {
    try { return await cb(a); } catch (e: any) { return err(name, e.message ?? String(e)); }
  });
}

// ================= Angle 1: Identity & Resolution =================

tool("resolve", "Turn a fuzzy name into the exact record: matches title → aliases → fuzzy-trigram. First tool when the caller would recognize the note. Then: read_note.",
  { name: z.string(), fuzzy: z.boolean().optional() },
  ({ name, fuzzy }) => {
    const q = name.toLowerCase();
    const hits: { id: string; path: string; title: string; matched_via: string; score: number }[] = [];
    for (const n of idx.notes.values()) {
      if (!visible(n)) continue;
      if (n.title.toLowerCase() === q) hits.push({ ...noteMeta(n), matched_via: "title", score: 1 });
      else if (n.aliases.some((a) => a.toLowerCase() === q)) hits.push({ ...noteMeta(n), matched_via: "alias", score: 0.95 });
      else if (n.title.toLowerCase().includes(q)) hits.push({ ...noteMeta(n), matched_via: "title-substring", score: 0.7 });
      else if (fuzzy !== false) {
        const s = trigramSim(q, n.title.toLowerCase());
        if (s > 0.45) hits.push({ ...noteMeta(n), matched_via: "fuzzy-trigram", score: s * 0.6 });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return json(envelope({ strategy: "resolve", hits: hits.slice(0, 10) as unknown as Hit[] }));
  });

tool("read_note", "Read a note by id or path. mode: full|body|frontmatter. follow_embeds inlines ![[…]] one level with provenance markers.",
  { ref: z.string().describe("id or vault-relative path or title"),
    mode: z.enum(["full","body","frontmatter"]).optional(),
    follow_embeds: z.boolean().optional() },
  ({ ref, mode, follow_embeds }) => {
    const n = findNote(ref);
    if (!n) return err("read_note", `not found: ${ref}`);
    if (!visible(n)) return json({ id: n.id, title: n.title, classification: n.classification, redacted: true });
    let body = servableBody(n);
    if (body === null && n.pii) return json({ ...noteMeta(n), pii: true, body_withheld: "pii policy: summary-only at this clearance" });
    if (follow_embeds && body) {
      body = body.replace(/!\[\[([^\]]+)\]\]/g, (_, t) => {
        const e = findNote(String(t).split("|")[0]);
        const eb = e ? servableBody(e) : null;
        return e && eb !== null ? `\n<!-- embed:${e.path} -->\n${eb}\n<!-- /embed -->\n` : `![[${t}]] <!-- unresolved or withheld -->`;
      });
    }
    if (mode === "frontmatter") return json({ ...noteMeta(n), frontmatter: n.frontmatter });
    if (mode === "body") return json({ id: n.id, path: n.path, body });
    return json({ ...noteMeta(n), frontmatter: n.frontmatter, body });
  });

tool("read_section", "Surgical read: one section by heading_path ('H1::H2') or lines [a,b]. Keeps agent context lean.",
  { ref: z.string(), heading_path: z.string().optional(), lines: z.tuple([z.number(), z.number()]).optional() },
  ({ ref, heading_path, lines }) => {
    const n = findNote(ref);
    if (!n) return err("read_section", `not found: ${ref}`);
    const body = servableBody(n);
    if (body === null) return err("read_section", "content withheld (clearance or pii policy)");
    if (lines) {
      const ls = body.split("\n").slice(Math.max(0, lines[0] - 1), lines[1]);
      return json({ id: n.id, lines, fragment: ls.join("\n") });
    }
    if (heading_path) {
      const ch = chunkBody(n).find((c) => c.heading_path.toLowerCase() === heading_path.toLowerCase());
      if (!ch) return err("read_section", `heading_path not found: ${heading_path}. Available: ${chunkBody(n).map((c) => c.heading_path).join(" | ")}`);
      return json({ id: n.id, chunk_ref: ch.chunk_ref, breadcrumb: ch.heading_path, fragment: ch.text });
    }
    return err("read_section", "provide heading_path or lines");
  });

tool("read_property", "Read one frontmatter field, original type preserved; distinguishes missing vs null.",
  { ref: z.string(), field: z.string() },
  ({ ref, field }) => {
    const n = findNote(ref);
    if (!n) return err("read_property", `not found: ${ref}`);
    if (!visible(n)) return err("read_property", "withheld: classification above clearance");
    const present = field in n.frontmatter;
    return json({ id: n.id, field, present, value: present ? n.frontmatter[field] : undefined });
  });

tool("get_vault_guide", "Self-describing vault: the schema constitution, tag registry, and the angle→question routing map, live. Call once per session.",
  {},
  () => {
    const read = (p: string) => { try { return fs.readFileSync(path.join(VAULT, p), "utf8"); } catch { return null; } };
    return json({
      constitution: read("00-system/schema/00-vault-initial-state.md") ?? read("00-vault-initial-state.md"),
      tag_registry: read("00-system/schema/tag-registry.md"),
      routing_map: ROUTING_MAP,
      clearance: CLEARANCE,
      write_path: "All mutations go through curator_propose on the curator-gate server. This server is read-only.",
    });
  });

tool("list_notes", "Browse without search: paged listing with summary per hit.",
  { filters: FilterSchema, sort: z.enum(["modified","created","title","path"]).optional(),
    limit: z.number().optional(), cursor: z.number().optional() },
  ({ filters, sort, limit, cursor }) => {
    const all = applyFilters(idx.notes.values(), filters).filter(visible);
    const key = sort ?? "modified";
    // stable order: compare on key, tie-break by id so equal keys don't shuffle (#36)
    all.sort((a, b) => {
      const av = (a as any)[key] ?? "", bv = (b as any)[key] ?? "";
      if (av !== bv) return av < bv ? 1 : -1;   // desc for dates; title/path desc too, documented
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const off = cursor ?? 0, lim = Math.min(limit ?? 50, 200);
    return json(envelope({
      strategy: "list", hits: all.slice(off, off + lim).map((n) => ({ ...noteMeta(n), score: 0, why: "listing" })) as unknown as Hit[],
      next_cursor: off + lim < all.length ? off + lim : null, total: all.length,
    }));
  });

tool("get_attachment", "Fetch an evidence artifact from 40-sources/_assets/ as base64 + MIME + doc_hash for integrity checks.",
  { path: z.string() },
  ({ path: rel }) => {
    const norm = path.normalize(rel);
    if (norm.startsWith("..") || path.isAbsolute(norm)) return err("get_attachment", "path escapes vault");
    if (!norm.startsWith("40-sources/_assets/")) return err("get_attachment", "attachments live under 40-sources/_assets/ only");
    const abs = path.join(VAULT, norm);
    const buf = fs.readFileSync(abs);
    const ext = path.extname(norm).toLowerCase();
    const mime: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg", ".txt": "text/plain", ".csv": "text/csv", ".json": "application/json" };
    return json({ path: norm, mime: mime[ext] ?? "application/octet-stream",
      doc_hash: createHash("sha256").update(buf).digest("hex"),
      size: buf.length, base64: buf.toString("base64") });
  });

// ================= Angle 2: Lexical / FTS =================

tool("fts_search", "Precision channel: SQLite FTS5 BM25 (phrases, NEAR, prefix*) over title+aliases+headings+summary+body, field-weighted. For exact terms, identifiers, jargon.",
  { query: z.string(), filters: FilterSchema, limit: z.number().optional() },
  ({ query, filters, limit }) => {
    const t0 = Date.now();
    const r = engine.ftsQuery(query, filters, Math.min(limit ?? 20, 100));
    return json(envelope({ strategy: "fts5-bm25", hits: [...r.hits, ...r.redacted],
      diagnostics: { candidates: r.candidates, timings_ms: { sparse: Date.now() - t0 }, warnings: [] } }));
  });

tool("regex_search", "The grep escape hatch: regex over note bodies with context lines. Capped result size.",
  { pattern: z.string(), context_lines: z.number().optional(), filters: FilterSchema, limit: z.number().optional() },
  ({ pattern, context_lines, filters, limit }) => {
    let re: RegExp;
    try { re = new RegExp(pattern, "gm"); } catch (e: any) { return err("regex_search", `bad pattern: ${e.message}`); }
    const ctx = Math.min(context_lines ?? 1, 5);
    const cap = Math.min(limit ?? 50, 200);
    const matches: any[] = [];
    outer: for (const n of applyFilters(idx.notes.values(), filters)) {
      const body = servableBody(n);
      if (body === null) continue;
      const lines = body.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          re.lastIndex = 0;
          matches.push({ id: n.id, path: n.path, line: i + 1,
            context: lines.slice(Math.max(0, i - ctx), i + ctx + 1).join("\n") });
          if (matches.length >= cap) break outer;
        }
        re.lastIndex = 0;
      }
    }
    return json(envelope({ strategy: "regex", matches, diagnostics: { candidates: matches.length, warnings: [] } }));
  });

tool("property_query", "The 'vault as database' tool: JsonLogic-style predicate over typed frontmatter, e.g. {\"and\":[{\"==\":[\"type\",\"task\"]},{\"<\":[\"due\",\"2026-09-01\"]}]}.",
  { expr: z.record(z.any()), fields: z.array(z.string()).optional(), filters: FilterSchema },
  ({ expr, fields, filters }) => {
    const rows: any[] = [];
    for (const n of applyFilters(idx.notes.values(), filters)) {
      if (!visible(n)) continue;
      if (!jsonLogic(expr, n)) continue;
      const row: any = noteMeta(n);
      for (const f of fields ?? []) row[f] = n.frontmatter[f] ?? null;
      rows.push(row);
    }
    return json(envelope({ strategy: "property-query", rows, total: rows.length }));
  });

tool("tag_index", "Every tag + usage counts with hierarchical rollup, from the parser's authoritative index (frontmatter + inline, code blocks excluded). Curator taxonomy-drift input.",
  { prefix: z.string().optional() },
  ({ prefix }) => {
    const counts = new Map<string, number>();
    for (const n of idx.notes.values()) {
      if (!visible(n)) continue;
      const inline = [...n.body.replace(/```[\s\S]*?```/g, "").matchAll(/(?<=\s|^)#[\p{L}\p{N}/-]+/gmu)].map((m) => m[0]);
      for (const t of new Set([...n.tags, ...inline]))
        counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    // rollup to parents
    const rollup = new Map<string, number>();
    for (const [t, c] of counts) {
      const parts = t.slice(1).split("/");
      for (let i = 1; i <= parts.length; i++)
        rollup.set("#" + parts.slice(0, i).join("/"), (rollup.get("#" + parts.slice(0, i).join("/")) ?? 0) + c);
    }
    const out = [...rollup.entries()]
      .filter(([t]) => !prefix || t.startsWith(prefix))
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count, direct: counts.get(tag) ?? 0 }));
    return json(envelope({ strategy: "tag-index", tags: out }));
  });

tool("query_base", "Evaluate a .base file's filter/formula DSL server-side — rows exactly as Obsidian's Bases engine computes them. One source of truth for 'what's on the board'.",
  { base_path: z.string(), view: z.string().optional() },
  ({ base_path, view }) => {
    const def = loadBase(VAULT, base_path);
    const result = queryBase(def, [...idx.notes.values()].filter(visible), view);
    return json(envelope({ strategy: "bases-dsl", ...result,
      status: result.unsupported?.length ? "degraded" : "ok",
      diagnostics: { warnings: result.unsupported?.length
        ? [`.base uses expressions this evaluator does not support (returned as false): ${result.unsupported.join("; ")}`] : [] } }));
  });

// ================= Angle 3: Semantic (degraded without local embedder) =================

const SEMANTIC_DEGRADED = {
  status: "degraded" as const,
  warnings: ["semantic channel unavailable: no local embedding model configured (embedder=none)"],
  recommendations: [
    "lexical fallback was used (token-set similarity) — weaker recall than dense vectors",
    "to enable: deploy with --embedder onnx:<local-model-path> on a machine with disk headroom",
  ],
};

tool("semantic_search", "Recall channel: meaning over wording. DEGRADED on this deployment (no local embedder) — serves lexical-similarity fallback and says so.",
  { query: z.string(), granularity: z.enum(["chunk","note"]).optional(), filters: FilterSchema, limit: z.number().optional() },
  ({ query, filters, limit }) => {
    const hits = engine.lexicalSimilar(query, filters, Math.min(limit ?? 20, 100));
    return json(envelope({ status: SEMANTIC_DEGRADED.status, strategy: "lexical-fallback",
      hits, diagnostics: { warnings: SEMANTIC_DEGRADED.warnings }, recommendations: SEMANTIC_DEGRADED.recommendations }));
  });

tool("similar_notes", "Neighbors of a note by stored vectors (no live embed). DEGRADED: lexical similarity over title+aliases+summary+tags.",
  { ref: z.string(), limit: z.number().optional() },
  ({ ref, limit }) => {
    const n = findNote(ref);
    if (!n) return err("similar_notes", `not found: ${ref}`);
    const seed = [n.title, ...n.aliases, n.summary, n.tags.join(" ")].join(" ");
    const hits = engine.lexicalSimilar(seed, undefined, Math.min(limit ?? 10, 50), n.id);
    return json(envelope({ status: SEMANTIC_DEGRADED.status, strategy: "lexical-fallback", hits,
      diagnostics: { warnings: SEMANTIC_DEGRADED.warnings }, recommendations: SEMANTIC_DEGRADED.recommendations }));
  });

tool("similar_to_text", "'Does the vault already know this?' — the dedup pre-check before proposing a new note. DEGRADED: lexical similarity.",
  { text: z.string(), filters: FilterSchema, limit: z.number().optional() },
  ({ text, filters, limit }) => {
    const hits = engine.lexicalSimilar(text, filters, Math.min(limit ?? 10, 50));
    return json(envelope({ status: SEMANTIC_DEGRADED.status, strategy: "lexical-fallback", hits,
      diagnostics: { warnings: SEMANTIC_DEGRADED.warnings }, recommendations: SEMANTIC_DEGRADED.recommendations }));
  });

// ================= Angle 4: Hybrid =================

tool("search", "THE primary retrieval front door: sparse (FTS5) + dense fused via RRF. mode auto routes by query shape and reports its choice in strategy.",
  { query: z.string(), mode: z.enum(["hybrid","sparse","dense","auto"]).optional(),
    rerank: z.boolean().optional(), filters: FilterSchema, limit: z.number().optional() },
  async ({ query, mode, rerank, filters, limit }) => {
    let m = mode ?? "auto";
    if (m === "auto") m = /["'`]|[A-Z]{2,}\d|--|::/.test(query) || query.split(/\s+/).length <= 2 ? "sparse" : "hybrid";
    const env = await engine.hybrid(query, m, filters, Math.min(limit ?? 20, 100));
    // rerank requested but no cross-encoder ships (needs a local model, like the dense
    // channel) — say so rather than silently ignore it (finding #21, spec §13).
    if (rerank) {
      env.diagnostics.warnings.push("rerank requested but no cross-encoder is configured (embedder=none); results are RRF-fused only, not reranked");
      env.recommendations.push("deploy a local cross-encoder to enable intent rerank of the top candidates");
      if (env.status === "ok") env.status = "degraded";
    }
    return json(env);
  });

tool("answer_context", "Retrieval-for-generation: one call assembles top chunks + summary headers + 1-hop Related rationales, deduped, under budget_tokens, citations attached.",
  { query: z.string(), budget_tokens: z.number(), filters: FilterSchema },
  async ({ query, budget_tokens, filters }) => {
    const env = await engine.hybrid(query, "hybrid", filters, 12);
    const budget = Math.max(200, budget_tokens);
    let used = 0;
    const spans: any[] = [];
    const g = graphOf();
    for (const h of env.hits ?? []) {
      if (h.redacted) continue;
      const n = idx.notes.get(h.id)!;
      const chunk = h.chunk_ref ? idx.chunks.get(h.chunk_ref)?.text : null;
      const text = `## ${n.title}\n> ${n.summary}\n${chunk ?? servableBody(n)?.slice(0, 1200) ?? ""}`;
      const toks = Math.ceil(text.length / 4);
      if (used + toks > budget) break;
      used += toks;
      const related = [...g.neighbors(n.id, "out", ["related"])].slice(0, 3)
        .map(([to, es]) => ({ id: to, title: idx.notes.get(to)?.title, rationale: es[0]?.context ?? null }));
      spans.push({ citation: h.chunk_ref ?? h.id, text, related });
    }
    return json(envelope({ status: env.status, strategy: `answer-context(${env.strategy})`,
      spans, budget_tokens: budget, used_tokens_est: used,
      diagnostics: env.diagnostics, recommendations: env.recommendations }));
  });

// ================= Angle 5: Graph Traversal =================

const EdgeKinds = z.array(z.enum(["body","up","related","source"])).optional();

tool("backlinks", "Context-carrying backlinks: linking notes + the sentence containing each link (the edge's meaning).",
  { ref: z.string(), include_context: z.boolean().optional() },
  ({ ref, include_context }) => {
    const n = findNote(ref);
    if (!n) return err("backlinks", `not found: ${ref}`);
    const g = graphOf();
    const links = [...g.neighbors(n.id, "in")].map(([from, es]) => {
      const src = idx.notes.get(from)!;
      if (!visible(src)) return { id: from, redacted: true };
      return { id: from, path: src.path, title: src.title,
        edges: es.map((e) => ({ kind: e.kind, context: include_context !== false ? e.context : undefined })) };
    });
    return json(envelope({ strategy: "backlinks", target: n.id, links }));
  });

tool("outlinks", "Outgoing edges, typed. edge_types:['source'] alone = the evidence chain.",
  { ref: z.string(), edge_types: EdgeKinds },
  ({ ref, edge_types }) => {
    const n = findNote(ref);
    if (!n) return err("outlinks", `not found: ${ref}`);
    const g = graphOf();
    const links = [...g.neighbors(n.id, "out", edge_types)].map(([to, es]) => {
      const dst = idx.notes.get(to)!;
      if (!visible(dst)) return { id: to, redacted: true };
      return { id: to, path: dst.path, title: dst.title, edges: es.map((e) => ({ kind: e.kind, context: e.context })) };
    });
    return json(envelope({ strategy: "outlinks", source: n.id, links }));
  });

tool("neighborhood", "The local map: subgraph {nodes[], edges[]} around a note, depth ≤3, node payloads are summaries not bodies.",
  { ref: z.string(), depth: z.number().optional(), direction: z.enum(["out","in","both"]).optional(),
    edge_types: EdgeKinds, filters: FilterSchema },
  ({ ref, depth, direction, edge_types, filters }) => {
    const n = findNote(ref);
    if (!n) return err("neighborhood", `not found: ${ref}`);
    const g = graphOf();
    const d = Math.min(depth ?? 1, 3);
    const seen = new Set([n.id]);
    let frontier = [n.id];
    const edges: any[] = [];
    for (let hop = 0; hop < d; hop++) {
      const next: string[] = [];
      for (const id of frontier)
        for (const [nb, es] of g.neighbors(id, direction ?? "both", edge_types)) {
          for (const e of es) edges.push({ from: e.from, to: e.to, kind: e.kind, context: e.context });
          if (!seen.has(nb)) { seen.add(nb); next.push(nb); }
        }
      frontier = next;
    }
    const allowed = new Set(applyFilters([...seen].map((id) => idx.notes.get(id)!).filter(Boolean), filters).map((x) => x.id));
    allowed.add(n.id);
    const nodes = [...seen].filter((id) => allowed.has(id)).map((id) => {
      const x = idx.notes.get(id)!;
      return visible(x) ? { id, title: x.title, path: x.path, type: x.type, summary: x.summary }
                        : { id, title: x.title, redacted: true };
    });
    return json(envelope({ strategy: "neighborhood", center: n.id, depth: d, nodes,
      edges: edges.filter((e) => allowed.has(e.from) && allowed.has(e.to)) }));
  });

tool("path_between", "'How is X connected to Y' — shortest paths with each hop's edge type + rationale clause. The question embeddings can't answer.",
  { ref_a: z.string(), ref_b: z.string(), max_paths: z.number().optional(), edge_types: EdgeKinds },
  ({ ref_a, ref_b, max_paths, edge_types }) => {
    const a = findNote(ref_a), b = findNote(ref_b);
    if (!a || !b) return err("path_between", `not found: ${!a ? ref_a : ref_b}`);
    const paths = graphOf().paths(a.id, b.id, Math.min(max_paths ?? 3, 10), edge_types);
    return json(envelope({ strategy: "bfs-shortest-paths", paths: paths.map((p) => ({
      hops: p.path.length - 1,
      nodes: p.path.map((id) => ({ id, title: idx.notes.get(id)?.title })),
      edges: p.edges.map((e) => ({ kind: e.kind, rationale: e.context })),
    })) }));
  });

tool("shared_neighbors", "Triangulation: common neighbors of two notes ranked by combined edge weight — what sits between two concepts.",
  { ref_a: z.string(), ref_b: z.string() },
  ({ ref_a, ref_b }) => {
    const a = findNote(ref_a), b = findNote(ref_b);
    if (!a || !b) return err("shared_neighbors", `not found: ${!a ? ref_a : ref_b}`);
    const g = graphOf();
    const na = g.neighbors(a.id, "both"), nb = g.neighbors(b.id, "both");
    const shared = [...na.keys()].filter((k) => nb.has(k)).map((id) => {
      const x = idx.notes.get(id)!;
      return { id, title: x.title, path: x.path,
        weight: (na.get(id)?.length ?? 0) + (nb.get(id)?.length ?? 0),
        redacted: !visible(x) || undefined };
    }).sort((x, y) => y.weight - x.weight);
    return json(envelope({ strategy: "shared-neighbors", shared }));
  });

tool("expand", "Multi-hop composition primitive: input hits + their hop-neighbors, fused-scored. search → expand → rerank = agentic query decomposition.",
  { hits: z.array(z.object({ id: z.string(), score: z.number().optional() })),
    hops: z.number().optional(), edge_types: EdgeKinds, limit: z.number().optional() },
  ({ hits, hops, edge_types, limit }) =>
    json(envelope({ strategy: "graph-expand",
      hits: engine.expand(hits, hops ?? 1, edge_types, Math.min(limit ?? 30, 100)) })));

// ================= Angle 6: Graph Analytics =================

tool("central_notes", "Structure as signal: pagerank = load-bearing concepts; betweenness = bridge notes joining domains (review-priority); degree fallback.",
  { metric: z.enum(["pagerank","degree","betweenness"]).optional(), filters: FilterSchema, limit: z.number().optional() },
  ({ metric, filters, limit }) => {
    const g = graphOf();
    const m = metric ?? "pagerank";
    const scores: Map<string, number> =
      m === "pagerank" ? g.pagerank() :
      m === "betweenness" ? g.betweenness() :
      new Map([...g.nodes].map((id) => [id, g.degree(id)]));
    const allowed = new Set(applyFilters(idx.notes.values(), filters).filter(visible).map((n) => n.id));
    const ranked = [...scores.entries()].filter(([id]) => allowed.has(id))
      .sort((a, b) => b[1] - a[1]).slice(0, Math.min(limit ?? 20, 100))
      .map(([id, score]) => ({ ...noteMeta(idx.notes.get(id)!), metric: m, score }));
    return json(envelope({ strategy: `centrality-${m}`, ranked }));
  });

tool("communities", "Emergent topic structure vs the intended taxonomy: clusters with auto-labels (top terms + hub note). Curator's monthly taxonomy review diffs these two.",
  { algorithm: z.enum(["louvain","label_prop"]).optional(), min_size: z.number().optional() },
  ({ min_size }) => {
    const g = graphOf();
    const comms = g.communities(min_size ?? 2);
    const pr = g.pagerank();
    const clusters = [...comms.values()].map((members) => {
      const hub = members.sort((a, b) => (pr.get(b) ?? 0) - (pr.get(a) ?? 0))[0];
      const terms = topTerms(members.map((id) => idx.notes.get(id)!));
      return { size: members.length, hub: { id: hub, title: idx.notes.get(hub)?.title },
        label: terms.slice(0, 4).join(" "), members: members.map((id) => ({ id, title: idx.notes.get(id)?.title })) };
    }).sort((a, b) => b.size - a.size);
    return json(envelope({ strategy: "label-propagation", clusters,
      diagnostics: { warnings: ["algorithm=louvain not implemented; label_prop served"] } }));
  });

tool("orphans", "Notes with no in/out edges + age. Curator weekly-audit input.",
  { filters: FilterSchema },
  ({ filters }) => {
    const g = graphOf();
    const list = applyFilters(idx.notes.values(), filters).filter(visible)
      .filter((n) => g.degree(n.id) === 0 && !["00-system","01-inbox","30-daily"].includes(n.folder))
      .map((n) => ({ ...noteMeta(n), age_days: n.created ? Math.floor((Date.now() - Date.parse(n.created)) / 86400000) : null }));
    return json(envelope({ strategy: "orphans", orphans: list }));
  });

tool("broken_links", "Unresolved links with source + line. Must be empty for curated folders — a nonempty result IS an incident.",
  { folder: z.string().optional() },
  ({ folder }) => {
    const curated = ["10-notes","20-tasks","40-sources","50-entities"];
    const list = idx.unresolved
      .filter((u) => !folder || u.from_path.startsWith(folder))
      .map((u) => ({ ...u, curated: curated.some((c) => u.from_path.startsWith(c)) }));
    const incident = list.some((u) => u.curated);
    return json(envelope({ status: incident ? "degraded" : "ok", strategy: "broken-links",
      broken: list, diagnostics: { warnings: incident ? ["unresolved links in curated folders — incident"] : [] } }));
  });

tool("suggest_links", "Latent edges the graph is missing: similar-but-unlinked note pairs, scored. Suggestions only — becoming real links requires the Curator gate.",
  { min_similarity: z.number().optional(), limit: z.number().optional() },
  ({ min_similarity, limit }) => {
    const g = graphOf();
    const notes = [...idx.notes.values()].filter((n) => visible(n) && !["00-system","01-inbox","30-daily","90-archive"].includes(n.folder));
    const min = min_similarity ?? 0.25;
    const pairs: any[] = [];
    for (const n of notes) {
      const seed = [n.title, ...n.aliases, n.summary, n.tags.join(" ")].join(" ");
      for (const h of engine.lexicalSimilar(seed, undefined, 6, n.id)) {
        if (h.score < min) continue;
        if (g.adj.get(n.id)?.has(h.id) || g.radj.get(n.id)?.has(h.id)) continue;
        if (n.id < h.id) pairs.push({ a: { id: n.id, title: n.title }, b: { id: h.id, title: h.title }, score: h.score });
      }
    }
    pairs.sort((x, y) => y.score - x.score);
    return json(envelope({ status: "degraded", strategy: "lexical-similar-unlinked",
      suggestions: pairs.slice(0, Math.min(limit ?? 25, 100)),
      diagnostics: { warnings: SEMANTIC_DEGRADED.warnings }, recommendations: SEMANTIC_DEGRADED.recommendations }));
  });

tool("concept_gaps", "Structural holes: stub hubs (heavily-linked drafts), missing-middle pairs, dead-end chains — where the knowledge system is thinnest.",
  {},
  () => {
    const g = graphOf();
    const stub_hubs = [...idx.notes.values()]
      .filter((n) => n.status === "draft" && (g.radj.get(n.id)?.size ?? 0) >= 3 && visible(n))
      .map((n) => ({ ...noteMeta(n), inbound: g.radj.get(n.id)!.size }));
    const dead_ends = [...idx.notes.values()]
      .filter((n) => visible(n) && n.folder === "10-notes" && (g.radj.get(n.id)?.size ?? 0) >= 2 && !(g.adj.get(n.id)?.size))
      .map((n) => ({ ...noteMeta(n), inbound: g.radj.get(n.id)!.size, outbound: 0 }));
    return json(envelope({ strategy: "concept-gaps", stub_hubs, dead_end_chains: dead_ends }));
  });

tool("vault_stats", "One-call health panel: counts, words, link density, tag coverage, type/status/classification histograms.",
  { filters: FilterSchema },
  ({ filters }) => {
    const notes = applyFilters(idx.notes.values(), filters).filter(visible);
    const hist = (key: (n: NoteRecord) => string) => {
      const h: Record<string, number> = {};
      for (const n of notes) h[key(n)] = (h[key(n)] ?? 0) + 1;
      return h;
    };
    const words = notes.reduce((s, n) => s + n.body.split(/\s+/).length, 0);
    return json(envelope({ strategy: "vault-stats",
      notes: notes.length, words, edges: idx.edges.length, unresolved_links: idx.unresolved.length,
      link_density: notes.length ? +(idx.edges.length / notes.length).toFixed(2) : 0,
      tagged_pct: notes.length ? +((notes.filter((n) => n.tags.length).length / notes.length) * 100).toFixed(1) : 0,
      by_type: hist((n) => n.type), by_status: hist((n) => n.status),
      by_classification: hist((n) => n.classification), by_folder: hist((n) => n.folder) }));
  });

// ================= Angle 7: Temporal & Audit =================

function requireRepo() { if (!git.isRepo()) throw new Error("vault is not a git repository — temporal angle unavailable"); }

tool("note_history", "Per-record regulated history: each accepted mutation's commit sha, timestamp, proposer, Curator verb, gate summary — parsed from the structured commit contract.",
  { ref: z.string(), limit: z.number().optional() },
  ({ ref, limit }) => {
    requireRepo();
    const n = findNote(ref);
    if (!n) return err("note_history", `not found: ${ref}`);
    return json(envelope({ strategy: "git-log", id: n.id, path: n.path,
      history: git.log(n.path, Math.min(limit ?? 50, 200)) }));
  });

tool("record_as_of", "The regulator-production tool: the note exactly as it existed at a timestamp or sha. git show behind a tool.",
  { ref: z.string(), timestamp: z.string().optional(), sha: z.string().optional() },
  ({ ref, timestamp, sha }) => {
    requireRepo();
    const n = findNote(ref);
    if (!n) return err("record_as_of", `not found: ${ref}`);
    if (!visible(n)) return err("record_as_of", "withheld: classification above clearance");
    const at = sha ?? (timestamp ? git.refAt(timestamp) : null);
    if (!at) return err("record_as_of", "provide sha or timestamp (no commit at-or-before that time)");
    return json({ id: n.id, path: n.path, as_of: at, content: git.showAt(n.path, at) });
  });

tool("vault_diff", "What changed structurally in a window: created/modified/archived notes between two points.",
  { since: z.string(), until: z.string().optional(), filters: FilterSchema },
  ({ since, until, filters }) => {
    requireRepo();
    const changes = git.diff(since, until)
      .filter((c) => c.path.endsWith(".md"))
      .map((c) => {
        const id = idx.byPath.get(c.path);
        const n = id ? idx.notes.get(id) : undefined;
        return { status: c.status, path: c.path, id: id ?? null, title: n?.title ?? null,
          current: n && applyFilters([n], filters).length > 0 };
      });
    return json(envelope({ strategy: "git-diff", since, until: until ?? "HEAD", changes }));
  });

tool("recent", "Recently modified notes with mutation verbs from the commit contract.",
  { since: z.string(), filters: FilterSchema, limit: z.number().optional() },
  ({ since, filters, limit }) => {
    requireRepo();
    const commits = git.commitsSince(since).slice(0, Math.min(limit ?? 50, 200));
    const items = commits.map((c) => ({ sha: c.sha, date: c.date, subject: c.subject,
      verb: /^curator\((\w+)\)/.exec(c.subject)?.[1] ?? null,
      notes: c.paths.filter((p) => p.endsWith(".md")).map((p) => {
        const id = idx.byPath.get(p);
        return { path: p, id: id ?? null, title: id ? idx.notes.get(id)!.title : null };
      }) }));
    void filters;
    return json(envelope({ strategy: "git-recent", items }));
  });

tool("attention", "Edit-volume timeseries with trend flags — where organizational attention is flowing, by tag/folder/entity.",
  { window: z.string().describe("e.g. '30 days ago'"), bucket: z.enum(["day","week"]).optional(),
    group_by: z.enum(["tag","folder","entity"]).optional() },
  ({ window, bucket, group_by }) => {
    requireRepo();
    const commits = git.commitsSince(window);
    const by = group_by ?? "folder";
    const series = new Map<string, Map<string, number>>();
    for (const c of commits) {
      const key = bucket === "week" ? isoWeek(c.date) : c.date.slice(0, 10);
      for (const p of c.paths.filter((x) => x.endsWith(".md"))) {
        const id = idx.byPath.get(p);
        const n = id ? idx.notes.get(id) : null;
        const groups = by === "folder" ? [p.split("/")[0]]
          : by === "tag" ? (n?.tags.length ? n.tags : ["untagged"])
          : (n?.type === "entity" ? [n.title] : []);
        for (const gk of groups) {
          if (!series.has(gk)) series.set(gk, new Map());
          series.get(gk)!.set(key, (series.get(gk)!.get(key) ?? 0) + 1);
        }
      }
    }
    const out = [...series.entries()].map(([group, m]) => {
      const buckets = [...m.entries()].sort();
      const half = Math.floor(buckets.length / 2);
      const early = buckets.slice(0, half).reduce((s, [, v]) => s + v, 0);
      const late = buckets.slice(half).reduce((s, [, v]) => s + v, 0);
      return { group, total: early + late, buckets: Object.fromEntries(buckets),
        trend: late > early * 1.5 ? "rising" : late < early * 0.5 ? "falling" : "steady" };
    }).sort((a, b) => b.total - a.total);
    return json(envelope({ strategy: "attention", window, bucket: bucket ?? "day", group_by: by, series: out }));
  });

tool("audit_query", "The audit trail as a database: matching entries from 00-system/audit/ joined to commits. Refusals/rejections are entries too.",
  { verb: z.string().optional(), proposer: z.string().optional(), id: z.string().optional(),
    since: z.string().optional(), until: z.string().optional() },
  ({ verb, proposer, id, since, until }) => {
    const auditDir = path.join(VAULT, "00-system", "audit");
    const entries: any[] = [];
    if (fs.existsSync(auditDir)) {
      for (const f of fs.readdirSync(auditDir).filter((x) => x.endsWith(".md"))) {
        for (const line of fs.readFileSync(path.join(auditDir, f), "utf8").split("\n")) {
          const m = /^-\s*(\S+)\s*\|\s*(\w+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*proposer=(\S+)\s*\|\s*commit=(\S+)\s*\|\s*note=(.*)$/.exec(line);
          if (!m) continue;
          const [, ts, v, nid, npath, prop, commit, note] = m;
          if (verb && v !== verb) continue;
          if (proposer && prop !== proposer) continue;
          if (id && nid !== id) continue;
          if (since && ts < since) continue;
          if (until && ts > until) continue;
          entries.push({ timestamp: ts, verb: v, id: nid, path: npath, proposer: prop, commit, note, audit_file: `00-system/audit/${f}` });
        }
      }
    }
    return json(envelope({ strategy: "audit-log", entries,
      diagnostics: { warnings: entries.length ? [] : ["no matching audit entries (or audit dir absent)"] } }));
  });

tool("provenance", "One call from 'the vault says X' to the frozen evidence: note → source edges → source records → doc_hash + ingest metadata → acceptance commit.",
  { ref: z.string() },
  ({ ref }) => {
    const n = findNote(ref.split("#")[0]);
    if (!n) return err("provenance", `not found: ${ref}`);
    const g = graphOf();
    const sources = [...g.neighbors(n.id, "out", ["source"])].map(([sid]) => {
      const s = idx.notes.get(sid)!;
      return { id: sid, title: s.title, path: s.path, status: s.status,
        doc_hash: s.frontmatter.doc_hash ?? null, ingested: s.frontmatter.ingested ?? null,
        author: s.frontmatter.author ?? null, published: s.frontmatter.published ?? null };
    });
    const history = git.isRepo() ? git.log(n.path, 5) : [];
    return json(envelope({ strategy: "provenance", claim: { id: n.id, title: n.title, origin: n.origin },
      sources, acceptance_commits: history,
      verified: sources.length > 0,
      diagnostics: { warnings: sources.length ? [] : ["no source edges — claim is unverified per constitution §3.3"] } }));
  });

// ================= Angle 8: Compliance Register =================

tool("retention_register", "The living GLBA data inventory / 17a-4 retention worklist: every record_class≠none note with class, retention_until, legal_hold, age.",
  { filters: FilterSchema },
  ({ filters }) => {
    // compliance inventory MUST include drafts and archive — a draft glba-npi note
    // is still a regulated record (finding #13).
    const rows = applyFilters(idx.notes.values(), { ...filters, include_archive: true, include_drafts: true }).filter(visible)
      .filter((n) => n.record_class.length)
      .map((n) => ({ ...noteMeta(n), record_class: n.record_class, retention_until: n.retention_until,
        legal_hold: n.legal_hold, pii: n.pii,
        age_days: n.created ? Math.floor((Date.now() - Date.parse(n.created)) / 86400000) : null }));
    return json(envelope({ strategy: "retention-register", rows, total: rows.length }));
  });

tool("disposal_docket", "Read-only view of what the Curator's monthly sweep will table: past retention, not held — awaiting human-authorized disposal.",
  { as_of: z.string().optional() },
  ({ as_of }) => {
    const cutoff = as_of ?? new Date().toISOString().slice(0, 10);
    const rows = [...idx.notes.values()].filter(visible)
      .filter((n) => n.record_class.length && !n.legal_hold && n.retention_until && n.retention_until <= cutoff)
      .map((n) => ({ ...noteMeta(n), record_class: n.record_class, retention_until: n.retention_until }));
    return json(envelope({ strategy: "disposal-docket", as_of: cutoff, rows,
      note: "disposal requires human sign-off via the Curator's retention-sweep — this is a read" }));
  });

tool("hold_set", "Everything under legal hold, grouped by hold reference.",
  { hold_ref: z.string().optional() },
  ({ hold_ref }) => {
    const rows = [...idx.notes.values()].filter(visible).filter((n) => n.legal_hold)
      .map((n) => ({ ...noteMeta(n), hold_ref: n.frontmatter.hold_ref ?? "unspecified",
        record_class: n.record_class, retention_until: n.retention_until }))
      .filter((r) => !hold_ref || r.hold_ref === hold_ref);
    const grouped: Record<string, any[]> = {};
    for (const r of rows) (grouped[String(r.hold_ref)] ??= []).push(r);
    return json(envelope({ strategy: "hold-set", holds: grouped }));
  });

tool("pii_map", "GDPR Art. 15/17 discovery primitive: pii-flagged notes with entity-hub joins for subject correlation. Clearance-gated at restricted.",
  { subject_hint: z.string().optional() },
  ({ subject_hint }) => {
    if (CLEARANCE !== "restricted")
      return err("pii_map", `clearance-gated at restricted (session clearance: ${CLEARANCE})`);
    const g = graphOf();
    const rows = [...idx.notes.values()].filter((n) => n.pii)
      .filter((n) => !subject_hint ||
        [n.title, n.summary, ...n.aliases].join(" ").toLowerCase().includes(subject_hint.toLowerCase()) ||
        [...g.neighbors(n.id, "both")].some(([nb]) => idx.notes.get(nb)?.title.toLowerCase().includes(subject_hint.toLowerCase())))
      .map((n) => ({ ...noteMeta(n), record_class: n.record_class,
        entity_hubs: [...g.neighbors(n.id, "both")].map(([nb]) => idx.notes.get(nb))
          .filter((x): x is NoteRecord => !!x && x.type === "entity")
          .map((x) => ({ id: x.id, title: x.title })) }));
    return json(envelope({ strategy: "pii-map", rows }));
  });

tool("schema_drift", "Machine-checkable health of the contract: constitution violations — missing/mistyped properties, unregistered tags, empty summaries past draft, unresolved curated links. Empty is the only acceptable steady state.",
  {},
  () => {
    const curated = ["10-notes","20-tasks","40-sources","50-entities"];
    const registry = readTagRegistry(VAULT);
    const violations: any[] = [];
    const ENUMS: Record<string, string[]> = {
      type: ["note","task","daily","source","entity","system","audit"],
      classification: ["public","internal","confidential","restricted"],
      origin: ["human","agent","hybrid"],
      record_class: ["none","sec-17a4","glba-npi","gdpr-personal","gdpr-special"],
      entity_type: ["person","org","system","regulation","project"],
    };
    const STATUS: Record<string, string[]> = {
      note: ["draft","active","stale","archived"], source: ["quarantined","accepted","superseded"],
      daily: ["open","closed"], entity: ["active","archived"],
      task: ["backlog","todo","doing","blocked","review","done"],
    };
    for (const n of idx.notes.values()) {
      if (!curated.includes(n.folder)) continue;
      if (n.missing.length) violations.push({ id: n.id, path: n.path, kind: "missing-properties", detail: n.missing });
      if (!n.summary && n.status !== "draft") violations.push({ id: n.id, path: n.path, kind: "empty-summary" });
      // enum membership (constitution §3)
      const fm = n.frontmatter;
      for (const [k, allowed] of Object.entries(ENUMS)) {
        if (k === "record_class") { const bad = n.record_class.filter((v) => !allowed.includes(v));
          if (bad.length) violations.push({ id: n.id, path: n.path, kind: "invalid-enum", detail: { field: k, bad } }); continue; }
        if (k === "entity_type" && n.type !== "entity") continue;
        if (k in fm && !allowed.includes(String(fm[k])))
          violations.push({ id: n.id, path: n.path, kind: "invalid-enum", detail: { field: k, value: fm[k] } });
      }
      if (n.type === "entity" && !("entity_type" in fm))
        violations.push({ id: n.id, path: n.path, kind: "missing-entity_type" });
      // status enum per type
      if (STATUS[n.type] && !STATUS[n.type].includes(n.status))
        violations.push({ id: n.id, path: n.path, kind: "invalid-status", detail: { type: n.type, status: n.status } });
      // tag discipline (§4): registered, depth ≤3, ≤5 per note
      if (n.tags.length > 5) violations.push({ id: n.id, path: n.path, kind: "too-many-tags", detail: n.tags.length });
      for (const t of n.tags) if (t.replace(/^#/, "").split("/").length > 3)
        violations.push({ id: n.id, path: n.path, kind: "tag-depth>3", detail: t });
      if (registry) {
        const bad = n.tags.filter((t) => !registry.has(t) && ![...registry].some((r) => t.startsWith(r + "/")));
        if (bad.length) violations.push({ id: n.id, path: n.path, kind: "unregistered-tags", detail: bad });
      }
      if (n.record_class.length && !n.retention_until && !n.legal_hold)
        violations.push({ id: n.id, path: n.path, kind: "retention_until-missing", detail: n.record_class });
      if (n.legal_hold && !("hold_ref" in fm))
        violations.push({ id: n.id, path: n.path, kind: "hold_ref-missing" });
      // provenance: curated note/source claiming verified without a source edge
      if ((n.type === "note" || n.type === "source") && fm.verified === true &&
          !idx.edges.some((e) => e.from === n.id && e.kind === "source"))
        violations.push({ id: n.id, path: n.path, kind: "verified-without-source" });
    }
    for (const u of idx.unresolved.filter((u) => curated.some((c) => u.from_path.startsWith(c))))
      violations.push({ id: u.from_id, path: u.from_path, kind: "unresolved-link", detail: u.target, line: u.line });
    for (const cyc of graphOf().upCycles())
      violations.push({ kind: "up-cycle", detail: cyc.map((id) => idx.notes.get(id)?.title ?? id) });
    for (const c of idx.titleCollisions)
      violations.push({ kind: "title-collision", detail: c });
    return json(envelope({ status: violations.length ? "degraded" : "ok", strategy: "schema-drift",
      violations, diagnostics: { warnings: registry ? [] : ["tag-registry.md absent — tag checks skipped"] } }));
  });

// ================= Angle 9: Work-State =================

tool("board", "Sugar over query_base for the canonical kanban: columns → cards. Agents answer 'what am I working on' from the same definition humans see.",
  { base: z.string().optional() },
  ({ base }) => {
    const candidates = [base, "00-system/bases/kanban-board.base", "bases/kanban-board.base"].filter(Boolean) as string[];
    for (const c of candidates) {
      try {
        const def = loadBase(VAULT, c);
        return json(envelope({ strategy: "board", base: c,
          ...queryBase(def, [...idx.notes.values()].filter(visible), "Board") }));
      } catch { /* try next */ }
    }
    return err("board", `no kanban base found (tried: ${candidates.join(", ")})`);
  });

tool("task_query", "Triage-shaped task search: 'blocked >14 days', 'due this week for [[X]]'.",
  { status: z.array(z.string()).optional(), project: z.string().optional(), due_before: z.string().optional(),
    priority_max: z.number().optional(), stale_days: z.number().optional() },
  ({ status, project, due_before, priority_max, stale_days }) => {
    const rows = [...idx.notes.values()].filter(visible).filter((n) => n.type === "task")
      .filter((n) => !status?.length || status.includes(n.status))
      .filter((n) => !project || String(n.frontmatter.project ?? "").includes(project))
      .filter((n) => !due_before || (n.frontmatter.due && String(n.frontmatter.due) <= due_before))
      .filter((n) => priority_max == null || Number(n.frontmatter.priority ?? 99) <= priority_max)
      .filter((n) => stale_days == null ||
        (n.modified != null && Date.now() - Date.parse(n.modified) >= stale_days * 86400000))
      .map((n) => ({ ...noteMeta(n), priority: n.frontmatter.priority ?? null, due: n.frontmatter.due ?? null,
        project: n.frontmatter.project ?? null, order: n.frontmatter.order ?? null }));
    return json(envelope({ strategy: "task-query", rows }));
  });

// ---------- shared bits ----------

const ROUTING_MAP = [
  { question: "the note about X (they'd recognize it)", first: "resolve", then: "read_note" },
  { question: "exact term / identifier / error string", first: "fts_search" },
  { question: "concept, paraphrase, 'anything on…'", first: "search (hybrid, auto)", then: "expand if thin" },
  { question: "answer this from the vault", first: "answer_context" },
  { question: "how do X and Y relate / why", first: "path_between, shared_neighbors", then: "read_section on hops" },
  { question: "what's around this note", first: "neighborhood" },
  { question: "what changed / when / who", first: "vault_diff, note_history, audit_query", then: "record_as_of" },
  { question: "prove it / what's the evidence", first: "provenance", then: "get_attachment" },
  { question: "structured predicate over metadata", first: "property_query / query_base" },
  { question: "board / work state", first: "board, task_query" },
  { question: "vault health / structure", first: "vault_stats, schema_drift, orphans, communities" },
  { question: "does the vault already have this?", first: "similar_to_text", then: "curator_propose if not" },
];

function trigramSim(a: string, b: string): number {
  const tri = (s: string) => { const t = new Set<string>(); const p = `  ${s} `; for (let i = 0; i < p.length - 2; i++) t.add(p.slice(i, i + 3)); return t; };
  const ta = tri(a), tb = tri(b);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter || 1);
}

function topTerms(notes: NoteRecord[]): string[] {
  const stop = new Set(["the","a","an","and","or","of","to","in","for","is","on","with","this","that","note","notes"]);
  const df = new Map<string, number>();
  for (const n of notes)
    for (const t of new Set([n.title, n.summary].join(" ").toLowerCase().split(/[^\p{L}\p{N}]+/u)))
      if (t.length > 3 && !stop.has(t)) df.set(t, (df.get(t) ?? 0) + 1);
  return [...df.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

// Proper ISO-8601 week (Thursday-anchored), correct across year boundaries (#37).
function isoWeek(dateIso: string): string {
  const d = new Date(dateIso);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;                 // Mon=0..Sun=6
  t.setUTCDate(t.getUTCDate() - day + 3);              // to the Thursday of this week
  const isoYear = t.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));  // Jan 4 is always in ISO week 1
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function readTagRegistry(vault: string): Set<string> | null {
  for (const p of ["00-system/schema/tag-registry.md", "templates/tag-registry.md"]) {
    try {
      const raw = fs.readFileSync(path.join(vault, p), "utf8");
      const tags = new Set([...raw.matchAll(/#[\p{L}\p{N}/-]+/gu)].map((m) => m[0]));
      if (tags.size) return tags;
    } catch { /* next */ }
  }
  return null;
}

/** Mini JsonLogic: var/==/!=/</>/<=/>=/and/or/!/in — the subset property_query documents. */
function jsonLogic(rule: any, n: NoteRecord): any {
  if (rule == null || typeof rule !== "object") return rule;
  const [op] = Object.keys(rule);
  const argsRaw = rule[op];
  const list = Array.isArray(argsRaw) ? argsRaw : [argsRaw];
  const resolveOperand = (a: any) =>
    typeof a === "string" && (a in n.frontmatter || ["type","status","title","path","folder","id"].includes(a))
      ? (a in n.frontmatter ? n.frontmatter[a] : (n as any)[a])
      : jsonLogic(a, n);
  const v = list.map(resolveOperand);
  switch (op) {
    case "var": return n.frontmatter[String(argsRaw)] ?? (n as any)[String(argsRaw)];
    case "==": return String(v[0] ?? "") === String(v[1] ?? "");
    case "!=": return String(v[0] ?? "") !== String(v[1] ?? "");
    case "<": return v[0] < v[1]; case ">": return v[0] > v[1];
    case "<=": return v[0] <= v[1]; case ">=": return v[0] >= v[1];
    case "and": return v.every(Boolean);
    case "or": return v.some(Boolean);
    case "!": return !v[0];
    case "in": return Array.isArray(v[1]) ? v[1].map(String).includes(String(v[0])) : String(v[1] ?? "").includes(String(v[0]));
    default: throw new Error(`unsupported jsonlogic op: ${op}`);
  }
}

// ---------- boot ----------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`vault-mcp 2.0.0 · vault=${VAULT} · clearance=${CLEARANCE} · notes=${idx.notes.size} · edges=${idx.edges.length} · embedder=none (semantic degraded) · readonly`);
