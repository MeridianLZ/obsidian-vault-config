// Vault scan → SQLite (FTS5) + in-memory note map + typed edge list.
// Incremental: mtime+size keyed. Constitution §6 is the contract.
// Store = node:sqlite (built-in, FTS5 present) — no native module, air-gap-clean (§1.4).

import { DatabaseSync } from "node:sqlite";
import matter from "gray-matter";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Chunk, Edge, NoteRecord, classRank } from "./types.js";

const REQUIRED_UNIVERSAL = [
  "type", "id", "summary", "aliases", "tags", "created", "modified",
  "status", "origin", "classification", "record_class", "legal_hold", "pii",
];

const CURATED_FOLDERS = ["10-notes", "20-tasks", "40-sources", "50-entities"];
const EXCLUDED_FOLDERS = ["00-system", "01-inbox"]; // index exclusions per §6 (00-system machinery, inbox quarantine)

export interface UnresolvedLink {
  from_id: string;
  from_path: string;
  target: string;
  line: number;
}

export class VaultIndex {
  db: DatabaseSync;
  notes = new Map<string, NoteRecord>();          // id → note
  byPath = new Map<string, string>();             // path → id
  byTitle = new Map<string, string>();            // lowercase title/alias → id
  edges: Edge[] = [];
  unresolved: UnresolvedLink[] = [];
  chunks = new Map<string, Chunk>();              // chunk_ref → chunk

  constructor(public vaultPath: string, dbPath?: string) {
    this.db = new DatabaseSync(dbPath ?? ":memory:");
    if (dbPath && dbPath !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
        note_id UNINDEXED, chunk_ref UNINDEXED, kind UNINDEXED,
        title, aliases, headings, summary, body,
        tokenize = 'porter unicode61'
      );
    `);
  }

  /** Full (re)scan. Idempotent: wipes + rebuilds. */
  scan(): void {
    this.notes.clear(); this.byPath.clear(); this.byTitle.clear();
    this.edges = []; this.unresolved = []; this.chunks.clear();
    this.db.exec("DELETE FROM fts;");

    for (const rel of this.walk("")) {
      if (!rel.endsWith(".md")) continue;
      const top = rel.split("/")[0];
      if (top.startsWith(".")) continue;
      const note = this.parseNote(rel);
      if (!note) continue;
      this.notes.set(note.id, note);
      this.byPath.set(note.path, note.id);
      this.byTitle.set(note.title.toLowerCase(), note.id);
      this.byTitle.set(normKey(note.title), note.id); // "Payments Operations" ↔ "payments-operations"
      for (const a of note.aliases) {
        this.byTitle.set(String(a).toLowerCase(), note.id);
        this.byTitle.set(normKey(String(a)), note.id);
      }
    }
    // second pass: links need the full title map
    const insert = this.db.prepare(
      "INSERT INTO fts (note_id, chunk_ref, kind, title, aliases, headings, summary, body) VALUES (?,?,?,?,?,?,?,?)");
    this.db.exec("BEGIN");
    try {
      for (const note of this.notes.values()) {
        this.extractEdges(note);
        const indexable = this.isIndexable(note);
        if (!indexable) continue;
        const body = note.pii ? "" : note.body; // summary-only serving for pii per policy
        insert.run(note.id, null, "note", note.title, note.aliases.join(" "), "", note.summary, body);
        if (!note.pii) {
          for (const ch of chunkBody(note)) {
            this.chunks.set(ch.chunk_ref, ch);
            insert.run(note.id, ch.chunk_ref, "chunk", note.title, "", ch.heading_path, "", ch.text);
          }
        }
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  isIndexable(n: NoteRecord): boolean {
    const top = n.folder;
    if (EXCLUDED_FOLDERS.includes(top)) return false;
    return true; // drafts stay in db; filtered at query time via include_drafts
  }

  private *walk(rel: string): Generator<string> {
    const abs = path.join(this.vaultPath, rel);
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) yield* this.walk(r);
      else yield r;
    }
  }

  parseNote(rel: string): NoteRecord | null {
    const abs = path.join(this.vaultPath, rel);
    let raw: string;
    try { raw = fs.readFileSync(abs, "utf8"); } catch { return null; }
    let fm: Record<string, unknown> = {}, body = raw;
    try { const p = matter(raw); fm = p.data ?? {}; body = p.content; } catch { /* malformed fm → drift */ }
    const title = path.basename(rel, ".md");
    const listy = (v: unknown): string[] =>
      Array.isArray(v) ? v.map(String) : v == null || v === "" ? [] : [String(v)];
    const missing = REQUIRED_UNIVERSAL.filter((k) => !(k in fm));
    const id = typeof fm.id === "string" && fm.id
      ? fm.id
      : "path:" + createHash("sha1").update(rel).digest("hex").slice(0, 16);
    const st = fs.statSync(abs);
    return {
      id, path: rel, title,
      type: String(fm.type ?? "note"),
      status: String(fm.status ?? "draft"),
      summary: String(fm.summary ?? ""),
      aliases: listy(fm.aliases),
      tags: listy(fm.tags).map((t) => (t.startsWith("#") ? t : "#" + t)),
      classification: (["public","internal","confidential","restricted"].includes(String(fm.classification))
        ? fm.classification : "internal") as NoteRecord["classification"],
      record_class: listy(fm.record_class).filter((r) => r !== "none"),
      retention_until: fm.retention_until ? String(fm.retention_until) : null,
      legal_hold: fm.legal_hold === true,
      pii: fm.pii === true,
      origin: String(fm.origin ?? ""),
      created: fm.created ? String(fm.created) : null,
      modified: fm.modified ? String(fm.modified) : null,
      frontmatter: fm, body,
      folder: rel.split("/")[0],
      mtime: st.mtimeMs,
      missing,
    };
  }

  /** typed frontmatter edges + body wikilinks with sentence context */
  private extractEdges(n: NoteRecord): void {
    const resolve = (target: string): string | null => {
      const clean = target.split("|")[0].split("#")[0].trim();
      return this.byTitle.get(clean.toLowerCase())
        ?? this.byTitle.get(normKey(clean))
        ?? this.byPath.get(clean.endsWith(".md") ? clean : clean + ".md")
        ?? null;
    };
    for (const kind of ["up", "related", "source"] as const) {
      for (const raw of toLinkList(n.frontmatter[kind])) {
        const to = resolve(raw);
        if (to) this.edges.push({ from: n.id, to, kind, context: null });
        else this.unresolved.push({ from_id: n.id, from_path: n.path, target: raw, line: 0 });
      }
    }
    // body wikilinks + ## Related rationale clauses
    const lines = n.body.split("\n");
    let inRelated = false;
    lines.forEach((line, i) => {
      if (/^##\s+Related\s*$/.test(line)) { inRelated = true; return; }
      else if (/^##\s/.test(line)) inRelated = false;
      const re = /\[\[([^\]]+)\]\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        const to = resolve(m[1]);
        if (!to) { this.unresolved.push({ from_id: n.id, from_path: n.path, target: m[1], line: i + 1 }); continue; }
        if (to === n.id) continue;
        const context = inRelated
          ? line.replace(/^-\s*/, "").trim()            // the rationale clause line
          : sentenceAround(line, m.index);
        const kind = inRelated ? "related" : "body";
        // dedupe identical edges
        if (!this.edges.some((e) => e.from === n.id && e.to === to && e.kind === kind))
          this.edges.push({ from: n.id, to, kind, context });
      }
    });
  }
}

/** Normalized resolution key: lowercase, runs of non-alphanumerics collapse to one dash. */
function normKey(s: string): string {
  return "~" + s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

function toLinkList(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : v == null ? [] : [v];
  return arr.map((x) => String(x).replace(/^\[\[|\]\]$/g, ""));
}

function sentenceAround(line: string, idx: number): string {
  const start = Math.max(line.lastIndexOf(". ", idx) + 1, 0);
  const endDot = line.indexOf(". ", idx);
  return line.slice(start, endDot === -1 ? line.length : endDot + 1).trim();
}

/** Constitution §6: split on ##, heading-path prefixed, ~200–400 tokens. */
export function chunkBody(n: NoteRecord): Chunk[] {
  const out: Chunk[] = [];
  const lines = n.body.split("\n");
  let h1 = n.title, h2 = "";
  let buf: string[] = [];
  let ord = 0;
  const flush = () => {
    const text = buf.join("\n").trim();
    buf = [];
    if (!text) return;
    const hp = h2 ? `${h1}::${h2}` : h1;
    out.push({ chunk_ref: `${n.id}#${hp}/${ord}`, note_id: n.id, heading_path: hp, ordinal: ord, text: `${hp}: ${text}` });
    ord++;
  };
  for (const line of lines) {
    const m1 = /^#\s+(.*)/.exec(line);
    const m2 = /^##\s+(.*)/.exec(line);
    if (m1) { flush(); h1 = m1[1].trim(); h2 = ""; }
    else if (m2) { flush(); h2 = m2[1].trim(); }
    else buf.push(line);
  }
  flush();
  return out;
}

export { CURATED_FOLDERS, EXCLUDED_FOLDERS, REQUIRED_UNIVERSAL };

/** R3 filter application over the note map. classification_max narrows *below* clearance. */
export function applyFilters(notes: Iterable<NoteRecord>, f: import("./types.js").Filters | undefined): NoteRecord[] {
  const out: NoteRecord[] = [];
  for (const n of notes) {
    if (f?.type?.length && !f.type.includes(n.type)) continue;
    if (f?.status?.length && !f.status.includes(n.status)) continue;
    if (f?.tags?.length && !f.tags.every((t) => n.tags.includes(t.startsWith("#") ? t : "#" + t))) continue;
    if (f?.folder && !n.path.startsWith(f.folder)) continue;
    if (f?.classification_max != null && classRank(n.classification) > classRank(f.classification_max)) continue;
    if (f?.record_class?.length && !f.record_class.some((r) => n.record_class.includes(r))) continue;
    if (f?.modified_after && (n.modified ?? "") < f.modified_after) continue;
    if (f?.modified_before && (n.modified ?? "9999") > f.modified_before) continue;
    if (!f?.include_drafts && n.status === "draft") continue;
    if (!f?.include_archive && (n.folder === "90-archive" || n.status === "archived")) continue;
    out.push(n);
  }
  return out;
}
