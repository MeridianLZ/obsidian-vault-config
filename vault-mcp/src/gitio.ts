// Temporal angle substrate: git shell helpers. Read-only invocations only (R1/R6).

import { execFileSync } from "node:child_process";

export class GitIO {
  constructor(public vaultPath: string) {}

  private git(args: string[]): string {
    try {
      return execFileSync("git", ["-C", this.vaultPath, ...args], {
        encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
      });
    } catch (e: any) {
      throw new Error(`git ${args[0]} failed: ${e.stderr?.toString?.().trim() ?? e.message}`);
    }
  }

  isRepo(): boolean {
    try { this.git(["rev-parse", "--git-dir"]); return true; } catch { return false; }
  }

  /** Structured log for one path (or whole vault), parsing the curator commit contract. */
  log(relPath: string | null, limit = 50): CommitInfo[] {
    const args = ["log", `--max-count=${limit}`, "--format=%H%x00%aI%x00%an%x00%B%x1e"];
    if (relPath) args.push("--follow", "--", relPath);
    let raw: string;
    try { raw = this.git(args); } catch { return []; }
    return raw.split("\x1e").filter((s) => s.trim()).map((entry) => {
      const [sha, date, author, message] = entry.trim().split("\x00");
      const m = /^curator\((\w+)\):\s*(.*?)\s*(\[([^\]]+)\])?$/m.exec(message ?? "");
      const gate = /gate:\s*(.*)$/m.exec(message ?? "")?.[1] ?? null;
      const proposer = /proposer:\s*(.*)$/m.exec(message ?? "")?.[1] ?? null;
      return {
        sha, date, author,
        subject: (message ?? "").split("\n")[0],
        curator_verb: m?.[1] ?? null,
        target: m?.[2] ?? null,
        note_id: m?.[4] ?? null,
        proposer, gate_summary: gate,
      };
    });
  }

  showAt(relPath: string, ref: string): string {
    return this.git(["show", `${ref}:${relPath}`]);
  }

  /** Resolve a timestamp to the last commit at-or-before it. */
  refAt(timestamp: string): string | null {
    const out = this.git(["rev-list", "-1", `--before=${timestamp}`, "HEAD"]).trim();
    return out || null;
  }

  /** name-status diff between two refs (or since a date). */
  diff(since: string, until?: string): { status: string; path: string }[] {
    const from = /^[0-9a-f]{7,40}$/.test(since) ? since : this.refAt(since);
    if (!from) return [];
    const to = until ? (/^[0-9a-f]{7,40}$/.test(until) ? until : this.refAt(until) ?? "HEAD") : "HEAD";
    const raw = this.git(["diff", "--name-status", from, to]);
    return raw.split("\n").filter(Boolean).map((l) => {
      const [status, ...rest] = l.split("\t");
      return { status, path: rest[rest.length - 1] };
    });
  }

  /** Commits in a window, with paths — attention/recent fuel. */
  commitsSince(since: string, until?: string): { sha: string; date: string; author: string; subject: string; paths: string[] }[] {
    const args = ["log", `--since=${since}`, "--format=%H%x00%aI%x00%an%x00%s", "--name-only"];
    if (until) args.push(`--until=${until}`);
    let raw: string;
    try { raw = this.git(args); } catch { return []; }
    const out: { sha: string; date: string; author: string; subject: string; paths: string[] }[] = [];
    let cur: (typeof out)[number] | null = null;
    for (const line of raw.split("\n")) {
      if (line.includes("\x00")) {
        const [sha, date, author, subject] = line.split("\x00");
        cur = { sha, date, author, subject, paths: [] };
        out.push(cur);
      } else if (line.trim() && cur) cur.paths.push(line.trim());
    }
    return out;
  }
}

export interface CommitInfo {
  sha: string; date: string; author: string; subject: string;
  curator_verb: string | null; target: string | null; note_id: string | null;
  proposer: string | null; gate_summary: string | null;
}
