// Minimal Bases-DSL evaluator: the subset used by the vault's .base files.
// ponytail: expression subset (==, !=, <, >, <=, >=, file.inFolder, now()-X.days);
// extend when a .base file actually uses more.

import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";
import { NoteRecord } from "./types.js";

export interface BaseDef {
  filters?: Cond;
  formulas?: Record<string, string>;
  views?: { type: string; name: string; groupBy?: string; columns?: string[];
            order?: string[]; properties?: string[]; filters?: Cond }[];
}
type Cond = { and?: (string | Cond)[]; or?: (string | Cond)[] } | string;

export function loadBase(vaultPath: string, basePath: string): BaseDef {
  const abs = path.isAbsolute(basePath) ? basePath : path.join(vaultPath, basePath);
  const raw = fs.readFileSync(abs, "utf8");
  // .base files are YAML (with comments); reuse gray-matter's YAML engine
  return (matter(`---\n${raw}\n---\n`).data ?? {}) as BaseDef;
}

function prop(n: NoteRecord, name: string): unknown {
  if (name === "file.name") return n.title;
  if (name.startsWith("formula.")) return undefined; // computed by caller
  if (name in n.frontmatter) return n.frontmatter[name];
  return (n as any)[name];
}

/** Unsupported-expression sink: populated during a queryBase run so callers can
 *  surface "this .base uses DSL we don't evaluate" instead of silently returning
 *  empty rows that read as "nothing to review" (finding #24). */
export const unsupportedExprs = new Set<string>();

/** Evaluate one expression string against a note. */
export function evalExpr(expr: string, n: NoteRecord): boolean {
  const inFolder = /^file\.inFolder\("([^"]+)"\)$/.exec(expr.trim());
  if (inFolder) return n.path.startsWith(inFolder[1]);
  const cmp = /^(\S+)\s*(==|!=|<=|>=|<|>)\s*(.+)$/.exec(expr.trim());
  if (!cmp) { unsupportedExprs.add(expr.trim()); return false; }
  const [, lhs, op, rhsRaw] = cmp;
  const left = prop(n, lhs);
  let right: unknown = rhsRaw.trim();
  if (/^".*"$/.test(right as string)) right = (right as string).slice(1, -1);
  else if (!isNaN(Number(right))) right = Number(right);
  const l = left == null ? "" : left;
  switch (op) {
    case "==": return String(l) === String(right);
    case "!=": return String(l) !== String(right);
    case "<":  return l < (right as any);
    case ">":  return l > (right as any);
    case "<=": return l <= (right as any);
    case ">=": return l >= (right as any);
  }
  return false;
}

export function evalCond(c: Cond | undefined, n: NoteRecord): boolean {
  if (!c) return true;
  if (typeof c === "string") return evalExpr(c, n);
  if (c.and) return c.and.every((x) => evalCond(x, n));
  if (c.or) return c.or.some((x) => evalCond(x, n));
  return true;
}

export interface BaseRow { id: string; path: string; title: string; [k: string]: unknown }

/** Compute view rows exactly as Bases would (for the supported subset). */
export function queryBase(def: BaseDef, notes: Iterable<NoteRecord>, viewName?: string):
  { view: string; groupBy?: string; groups?: Record<string, BaseRow[]>; rows?: BaseRow[]; unsupported?: string[] } {
  const view = def.views?.find((v) => v.name === viewName) ?? def.views?.[0]
    ?? { type: "table", name: "default" };
  unsupportedExprs.clear();
  const matched: NoteRecord[] = [];
  for (const n of notes) {
    if (!evalCond(def.filters, n)) continue;
    if (!evalCond(view.filters, n)) continue;
    matched.push(n);
  }
  const toRow = (n: NoteRecord): BaseRow => {
    const row: BaseRow = { id: n.id, path: n.path, title: n.title };
    for (const p of view.properties ?? []) {
      if (p.startsWith("formula.")) {
        const f = def.formulas?.[p.slice(8)];
        if (f && /\(now\(\)\s*-\s*created\)\.days/.test(f) && n.created)
          row[p] = Math.floor((Date.now() - Date.parse(n.created)) / 86400000);
      } else row[p] = prop(n, p) ?? null;
    }
    // board sugar always wants these
    for (const k of ["status", "priority", "due", "project", "order", "summary"])
      if (!(k in row)) row[k] = (prop(n, k) as any) ?? (k === "summary" ? n.summary : null);
    return row;
  };
  const sortRows = (rows: BaseRow[]) => {
    const keys = view.order ?? [];
    return rows.sort((a, b) => {
      for (const k of keys) {
        const av = a[k] ?? Infinity, bv = b[k] ?? Infinity;
        if (av !== bv) return av < bv ? -1 : 1;
      }
      return a.title < b.title ? -1 : 1;
    });
  };
  if (view.groupBy) {
    const groups: Record<string, BaseRow[]> = {};
    for (const col of view.columns ?? []) groups[col] = [];
    for (const n of matched) {
      const g = String(prop(n, view.groupBy) ?? "∅");
      (groups[g] ??= []).push(toRow(n));
    }
    for (const g of Object.keys(groups)) sortRows(groups[g]);
    const unsupported = unsupportedExprs.size ? [...unsupportedExprs] : undefined;
    return { view: view.name, groupBy: view.groupBy, groups, unsupported };
  }
  const unsupported = unsupportedExprs.size ? [...unsupportedExprs] : undefined;
  return { view: view.name, rows: sortRows(matched.map(toRow)), unsupported };
}
