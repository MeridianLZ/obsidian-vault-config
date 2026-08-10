// Shared types + the R3 filter block + the R4 result envelope.

export const CLASS_ORDER = ["public", "internal", "confidential", "restricted"] as const;
export type Classification = (typeof CLASS_ORDER)[number];

export function classRank(c: string | undefined): number {
  if (c == null) return 1; // absent → internal (the documented default)
  const i = CLASS_ORDER.indexOf(c as Classification);
  return i === -1 ? CLASS_ORDER.length - 1 : i; // unknown value → most-restrictive (fail-closed, audit R4)
}

export interface NoteRecord {
  id: string;            // ULID from frontmatter (R5); falls back to path-derived key
  path: string;          // vault-relative
  title: string;
  type: string;
  status: string;
  summary: string;
  aliases: string[];
  tags: string[];
  classification: Classification;
  record_class: string[];
  retention_until: string | null;
  legal_hold: boolean;
  pii: boolean;
  origin: string;
  created: string | null;
  modified: string | null;
  frontmatter: Record<string, unknown>;
  body: string;
  folder: string;        // top-level folder, e.g. "10-notes"
  mtime: number;
  missing: string[];     // required properties absent (schema_drift fuel)
}

export interface Chunk {
  chunk_ref: string;     // `${id}#${headingPath}/${ordinal}`
  note_id: string;
  heading_path: string;  // "H1::H2"
  ordinal: number;
  text: string;
}

export interface Edge {
  from: string;          // note id
  to: string;            // note id (resolved) — unresolved links tracked separately
  kind: "body" | "up" | "related" | "source";
  context: string | null; // sentence containing the link (body) or rationale clause (related)
}

// R3 common filter block
export interface Filters {
  type?: string[];
  status?: string[];
  tags?: string[];
  folder?: string;
  classification_max?: Classification;
  record_class?: string[];
  modified_after?: string;
  modified_before?: string;
  include_drafts?: boolean;
  include_archive?: boolean;
}

export interface Hit {
  id: string;
  path: string;
  title: string;
  score: number;
  summary: string;
  snippet?: string;
  chunk_ref?: string;
  classification: string;
  why: string;
  redacted?: boolean;
  [k: string]: unknown;
}

// R4 result envelope
export interface Envelope {
  schema_version: "2.0";
  status: "ok" | "degraded" | "error";
  strategy: string;
  confidence?: number;
  hits?: Hit[];
  diagnostics: {
    candidates?: number;
    fused?: number;
    reranked?: number;
    timings_ms?: Record<string, number>;
    warnings: string[];
  };
  recommendations: string[];
  [k: string]: unknown;
}

export function envelope(partial: Partial<Envelope> & { strategy: string }): Envelope {
  return {
    schema_version: "2.0",
    status: "ok",
    recommendations: [],
    ...partial,
    diagnostics: { warnings: [], ...(partial.diagnostics ?? {}) },
  };
}

// Redacted stub per R2: existence discoverable, content not. Path withheld too —
// a filename like "customer-jane-doe-pii.md" is signal above clearance (#34).
export function redactHit(n: NoteRecord): Hit {
  return {
    id: n.id, path: "", title: n.title, score: 0, summary: "",
    classification: n.classification, why: "redacted:classification>clearance", redacted: true,
  };
}
