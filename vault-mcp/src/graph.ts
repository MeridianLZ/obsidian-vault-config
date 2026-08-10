// In-memory graph analytics over the typed edge list. Small-vault scale; boring algorithms.

import { Edge } from "./types.js";

export class Graph {
  adj = new Map<string, Map<string, Edge[]>>();   // from → to → edges
  radj = new Map<string, Map<string, Edge[]>>();  // to → from → edges
  nodes = new Set<string>();

  constructor(edges: Edge[], nodeIds: Iterable<string>) {
    for (const id of nodeIds) this.nodes.add(id);
    for (const e of edges) {
      if (!this.nodes.has(e.from) || !this.nodes.has(e.to)) continue;
      push2(this.adj, e.from, e.to, e);
      push2(this.radj, e.to, e.from, e);
    }
  }

  neighbors(id: string, direction: "out" | "in" | "both", kinds?: string[]): Map<string, Edge[]> {
    const out = new Map<string, Edge[]>();
    const take = (m?: Map<string, Edge[]>) => {
      if (!m) return;
      for (const [k, es] of m) {
        const kept = kinds?.length ? es.filter((e) => kinds.includes(e.kind)) : es;
        if (kept.length) out.set(k, [...(out.get(k) ?? []), ...kept]);
      }
    };
    if (direction !== "in") take(this.adj.get(id));
    if (direction !== "out") take(this.radj.get(id));
    return out;
  }

  degree(id: string): number {
    return (this.adj.get(id)?.size ?? 0) + (this.radj.get(id)?.size ?? 0);
  }

  /** BFS shortest paths a→b (undirected), up to maxPaths of minimal length. */
  paths(a: string, b: string, maxPaths = 3, kinds?: string[]): { path: string[]; edges: Edge[] }[] {
    if (a === b) return [];
    const prev = new Map<string, string[]>(); // node → predecessors on shortest paths
    const dist = new Map<string, number>([[a, 0]]);
    const q = [a];
    while (q.length) {
      const cur = q.shift()!;
      if (cur === b) break;
      for (const [nb] of this.neighbors(cur, "both", kinds)) {
        const d = dist.get(cur)! + 1;
        if (!dist.has(nb)) { dist.set(nb, d); prev.set(nb, [cur]); q.push(nb); }
        else if (dist.get(nb) === d) prev.get(nb)!.push(cur);
      }
    }
    if (!dist.has(b)) return [];
    const results: string[][] = [];
    const build = (node: string, acc: string[]) => {
      if (results.length >= maxPaths) return;
      if (node === a) { results.push([a, ...acc]); return; }
      for (const p of prev.get(node) ?? []) build(p, [node, ...acc]);
    };
    build(b, []);
    return results.map((p) => ({
      path: p,
      edges: p.slice(0, -1).map((n, i) => {
        const es = this.adj.get(n)?.get(p[i + 1]) ?? this.radj.get(n)?.get(p[i + 1]) ?? [];
        return es[0] ?? { from: n, to: p[i + 1], kind: "body" as const, context: null };
      }),
    }));
  }

  pagerank(iterations = 30, d = 0.85): Map<string, number> {
    const n = this.nodes.size || 1;
    let rank = new Map([...this.nodes].map((id) => [id, 1 / n]));
    for (let i = 0; i < iterations; i++) {
      const next = new Map([...this.nodes].map((id) => [id, (1 - d) / n]));
      for (const id of this.nodes) {
        const out = this.adj.get(id);
        if (!out?.size) { // dangling: distribute
          const share = (d * rank.get(id)!) / n;
          for (const k of this.nodes) next.set(k, next.get(k)! + share);
          continue;
        }
        const share = (d * rank.get(id)!) / out.size;
        for (const [to] of out) next.set(to, (next.get(to) ?? 0) + share);
      }
      rank = next;
    }
    return rank;
  }

  /** Brandes betweenness (unweighted, undirected). Fine at vault scale. */
  betweenness(): Map<string, number> {
    const bc = new Map([...this.nodes].map((id) => [id, 0]));
    for (const s of this.nodes) {
      const stack: string[] = [];
      const pred = new Map<string, string[]>();
      const sigma = new Map<string, number>([[s, 1]]);
      const dist = new Map<string, number>([[s, 0]]);
      const q = [s];
      while (q.length) {
        const v = q.shift()!;
        stack.push(v);
        for (const [w] of this.neighbors(v, "both")) {
          if (!dist.has(w)) { dist.set(w, dist.get(v)! + 1); q.push(w); }
          if (dist.get(w) === dist.get(v)! + 1) {
            sigma.set(w, (sigma.get(w) ?? 0) + sigma.get(v)!);
            if (!pred.has(w)) pred.set(w, []);
            pred.get(w)!.push(v);
          }
        }
      }
      const delta = new Map<string, number>();
      while (stack.length) {
        const w = stack.pop()!;
        for (const v of pred.get(w) ?? []) {
          const inc = (sigma.get(v)! / sigma.get(w)!) * (1 + (delta.get(w) ?? 0));
          delta.set(v, (delta.get(v) ?? 0) + inc);
        }
        if (w !== s) bc.set(w, bc.get(w)! + (delta.get(w) ?? 0));
      }
    }
    return bc;
  }

  /** Label propagation communities. Deterministic order for reproducibility. */
  communities(minSize = 2): Map<string, string[]> {
    const label = new Map([...this.nodes].map((id) => [id, id]));
    const order = [...this.nodes].sort();
    for (let iter = 0; iter < 20; iter++) {
      let changed = false;
      for (const id of order) {
        const counts = new Map<string, number>();
        for (const [nb, es] of this.neighbors(id, "both"))
          counts.set(label.get(nb)!, (counts.get(label.get(nb)!) ?? 0) + es.length);
        if (!counts.size) continue;
        const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
        if (best !== label.get(id)) { label.set(id, best); changed = true; }
      }
      if (!changed) break;
    }
    const groups = new Map<string, string[]>();
    for (const [id, l] of label) { if (!groups.has(l)) groups.set(l, []); groups.get(l)!.push(id); }
    return new Map([...groups].filter(([, m]) => m.length >= minSize));
  }

  /** up-chain cycle detection */
  upCycles(): string[][] {
    const cycles: string[][] = [];
    const visit = (id: string, seen: string[]) => {
      if (seen.includes(id)) { cycles.push([...seen.slice(seen.indexOf(id)), id]); return; }
      for (const [to, es] of this.adj.get(id) ?? [])
        if (es.some((e) => e.kind === "up")) visit(to, [...seen, id]);
    };
    for (const id of this.nodes) visit(id, []);
    // dedupe rotations
    const key = (c: string[]) => [...c.slice(0, -1)].sort().join("|");
    const seenK = new Set<string>();
    return cycles.filter((c) => { const k = key(c); if (seenK.has(k)) return false; seenK.add(k); return true; });
  }
}

function push2(m: Map<string, Map<string, Edge[]>>, a: string, b: string, e: Edge) {
  if (!m.has(a)) m.set(a, new Map());
  const inner = m.get(a)!;
  if (!inner.has(b)) inner.set(b, []);
  inner.get(b)!.push(e);
}
