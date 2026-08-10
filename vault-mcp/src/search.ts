// Lexical (FTS5/BM25), degraded-capable semantic, RRF hybrid fusion, expand.

import { VaultIndex, applyFilters } from "./indexer.js";
import { Graph } from "./graph.js";
import { Envelope, Filters, Hit, NoteRecord, envelope, redactHit, classRank } from "./types.js";

// Field weights per spec §2: title 4x, aliases 3x, headings 2x, summary 2x, body 1x
const FTS_WEIGHTS = "0.0, 0.0, 0.0, 4.0, 3.0, 2.0, 2.0, 1.0"; // note_id, chunk_ref, kind unindexed→0

export interface Embedder {
  readonly name: string;                          // "none" | "onnx-local" | …
  embed(texts: string[]): Promise<number[][]>;    // throws if name==="none"
}

export const NoEmbedder: Embedder = {
  name: "none",
  embed: async () => { throw new Error("no local embedding model configured"); },
};

export class SearchEngine {
  constructor(
    public idx: VaultIndex,
    public graphOf: () => Graph,
    public clearance: string,
    public embedder: Embedder = NoEmbedder,
  ) {}

  visible(n: NoteRecord): boolean {
    return classRank(n.classification) <= classRank(this.clearance as any);
  }

  /** R2: filter to clearance BEFORE ranking; over-clearance notes surface as redacted stubs. */
  private partition(notes: NoteRecord[]): { ok: NoteRecord[]; redacted: NoteRecord[] } {
    const ok: NoteRecord[] = [], redacted: NoteRecord[] = [];
    for (const n of notes) (this.visible(n) ? ok : redacted).push(n);
    return { ok, redacted };
  }

  ftsQuery(query: string, filters: Filters | undefined, limit: number): { hits: Hit[]; candidates: number; redacted: Hit[] } {
    const t0 = Date.now();
    let rows: any[] = [];
    try {
      rows = this.idx.db.prepare(
        `SELECT note_id, chunk_ref, kind, snippet(fts, 7, '»', '«', '…', 24) AS snip,
                bm25(fts, ${FTS_WEIGHTS}) AS score
         FROM fts WHERE fts MATCH ? ORDER BY score LIMIT ?`,
      ).all(query, limit * 4);
    } catch {
      // FTS5 syntax error from raw user text → retry as quoted phrase-ish tokens
      const safe = query.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).join(" ");
      if (!safe) return { hits: [], candidates: 0, redacted: [] };
      rows = this.idx.db.prepare(
        `SELECT note_id, chunk_ref, kind, snippet(fts, 7, '»', '«', '…', 24) AS snip,
                bm25(fts, ${FTS_WEIGHTS}) AS score
         FROM fts WHERE fts MATCH ? ORDER BY score LIMIT ?`,
      ).all(safe, limit * 4);
    }
    // collapse chunks to best-per-note, keep chunk_ref of best
    const best = new Map<string, { score: number; chunk_ref: string | null; snip: string }>();
    for (const r of rows) {
      const s = -r.score; // bm25() returns negative-better in sqlite; invert to positive-better
      const cur = best.get(r.note_id);
      if (!cur || s > cur.score) best.set(r.note_id, { score: s, chunk_ref: r.chunk_ref, snip: r.snip });
    }
    const notes = applyFilters(
      [...best.keys()].map((id) => this.idx.notes.get(id)!).filter(Boolean), filters);
    const { ok, redacted } = this.partition(notes);
    const hits = ok.map((n) => {
      const b = best.get(n.id)!;
      return <Hit>{
        id: n.id, path: n.path, title: n.title, score: b.score,
        summary: n.summary, snippet: b.snip, chunk_ref: b.chunk_ref ?? undefined,
        classification: n.classification, why: `bm25:${b.score.toFixed(2)}`,
      };
    }).sort((a, b) => b.score - a.score).slice(0, limit);
    void t0;
    return { hits, candidates: rows.length, redacted: redacted.map(redactHit) };
  }

  /** Lexical similarity fallback (token Jaccard over title+aliases+summary+tags). */
  lexicalSimilar(seed: string, filters: Filters | undefined, limit: number, excludeId?: string): Hit[] {
    const tok = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2));
    const seedT = tok(seed);
    if (!seedT.size) return [];
    const scored: Hit[] = [];
    for (const n of applyFilters(this.idx.notes.values(), filters)) {
      if (n.id === excludeId || !this.visible(n)) continue;
      const nT = tok([n.title, ...n.aliases, n.summary, n.tags.join(" ")].join(" "));
      let inter = 0;
      for (const t of seedT) if (nT.has(t)) inter++;
      const union = seedT.size + nT.size - inter;
      const score = union ? inter / union : 0;
      if (score > 0.05)
        scored.push({ id: n.id, path: n.path, title: n.title, score, summary: n.summary,
          classification: n.classification, why: `lexical-jaccard:${score.toFixed(2)}` });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Reciprocal Rank Fusion of ranked lists. k=60 canonical. */
  static rrf(lists: Hit[][], k = 60): Hit[] {
    const acc = new Map<string, Hit & { _rrf: number; _why: string[] }>();
    lists.forEach((list, li) => {
      list.forEach((h, rank) => {
        const cur = acc.get(h.id) ?? { ...h, _rrf: 0, _why: [] };
        cur._rrf += 1 / (k + rank + 1);
        cur._why.push(`${li === 0 ? "sparse" : li === 1 ? "dense" : "aux"}:r${rank + 1}`);
        if (h.snippet && !cur.snippet) cur.snippet = h.snippet;
        acc.set(h.id, cur);
      });
    });
    return [...acc.values()]
      .map((h) => ({ ...h, score: h._rrf, why: h._why.join(", ") }))
      .sort((a, b) => b.score - a.score);
  }

  /** The §4 front door. Dense channel degrades gracefully when no embedder. */
  async hybrid(query: string, mode: string, filters: Filters | undefined, limit: number): Promise<Envelope> {
    const t0 = Date.now();
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const sparse = this.ftsQuery(query, filters, limit * 2);
    let dense: Hit[] = [];
    let strategy = "sparse";
    if (mode !== "sparse" && this.embedder.name !== "none") {
      // dense channel would go here (chunk-vector cosine); embedder available
      strategy = "hybrid";
    } else if (mode === "dense" || mode === "hybrid") {
      warnings.push(`dense channel unavailable: embedder=${this.embedder.name}`);
      recommendations.push("configure a local embedding model (--embedder onnx:<path>) to enable semantic recall");
      // lexical-similarity as a weak stand-in second channel
      dense = this.lexicalSimilar(query, filters, limit * 2);
      strategy = "sparse+lexical-fallback";
    }
    const fused = dense.length ? SearchEngine.rrf([sparse.hits, dense]) : sparse.hits;
    return envelope({
      status: warnings.length ? "degraded" : "ok",
      strategy,
      confidence: fused[0]?.score ?? 0,
      hits: [...fused.slice(0, limit), ...sparse.redacted],
      diagnostics: {
        candidates: sparse.candidates, fused: fused.length,
        timings_ms: { total: Date.now() - t0 }, warnings,
      },
      recommendations,
    });
  }

  /** §5 expand: hits + hop neighbors, fused-scored. */
  expand(hits: { id: string; score?: number }[], hops: number, kinds: string[] | undefined, limit: number): Hit[] {
    const g = this.graphOf();
    const scores = new Map<string, { score: number; why: string[] }>();
    for (const h of hits) scores.set(h.id, { score: h.score ?? 1, why: ["seed"] });
    let frontier = hits.map((h) => h.id);
    for (let hop = 1; hop <= Math.min(hops, 3); hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        const base = scores.get(id)?.score ?? 0;
        for (const [nb, es] of g.neighbors(id, "both", kinds)) {
          const typedBoost = es.some((e) => e.kind !== "body") ? 1.3 : 1.0;
          const inc = (base * 0.5 * typedBoost) / hop;
          const cur = scores.get(nb);
          if (!cur) { scores.set(nb, { score: inc, why: [`${hop}-hop from ${this.idx.notes.get(id)?.title ?? id}`] }); next.push(nb); }
          else cur.score += inc;
        }
      }
      frontier = next;
    }
    return [...scores.entries()]
      .map(([id, s]) => {
        const n = this.idx.notes.get(id);
        if (!n || !this.visible(n)) return null;
        return <Hit>{ id, path: n.path, title: n.title, score: s.score, summary: n.summary,
          classification: n.classification, why: `graph:${s.why[0]}` };
      })
      .filter((h): h is Hit => !!h)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
