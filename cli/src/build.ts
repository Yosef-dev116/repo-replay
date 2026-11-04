import { resolveIdentity } from "./identity.ts";
import { isIgnored } from "./ignore.ts";
import type { Commit } from "./git.ts";

export interface FileSnap {
  id: string;
  path: string;
  lines: number; // running added - deleted, never below 0
  churn: number; // added + deleted since the previous snapshot
  topAuthor: string; // author with the most churn on this file, all time
}

export interface MonthSnap {
  month: string; // YYYY-MM
  files: FileSnap[];
  // commits and authors count the period since the previous snapshot.
  // files and lines describe the tree at the end of the month.
  stats: { files: number; lines: number; commits: number; authors: number };
}

export interface RepoJson {
  repo: string;
  months: MonthSnap[];
}

/** Run facts that the CLI prints but does not write to the JSON. */
export interface BuildReport {
  unknownRenames: number; // renames whose oldPath had no id
}

interface Live {
  path: string;
  lines: number;
  churn: number;
  byAuthor: Map<string, number>;
}

export const MAX_MONTHS = 120;

const monthOf = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 7);

function nextMonth(m: string): string {
  let [y, mo] = m.split("-").map(Number);
  if (++mo > 12) { mo = 1; y++; }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/** Pick `max` indices from 0..n-1, evenly spread, always first and last. */
export function sampleIndices(n: number, max: number): number[] {
  if (n <= max) return [...Array(n).keys()];
  return [...Array(max).keys()].map((i) => Math.round((i * (n - 1)) / (max - 1)));
}

interface RawMonth {
  month: string;
  files: FileSnap[]; // churn is cumulative here
  lines: number;
  commits: number; // commits in this calendar month
  authors: Set<string>; // authors in this calendar month
}

export async function buildRepoJson(
  repo: string,
  commits: AsyncIterable<Commit>,
  maxMonths = MAX_MONTHS,
  report: BuildReport = { unknownRenames: 0 },
): Promise<RepoJson> {
  const idOf = new Map<string, string>(); // path -> id, live files only
  const live = new Map<string, Live>(); // id -> state
  const raw: RawMonth[] = [];
  let month: string | undefined;
  let commitsInMonth = 0;
  let authorsInMonth = new Set<string>();

  const snapshot = (m: string) => {
    const files: FileSnap[] = [];
    let lines = 0;
    for (const [id, f] of live) {
      if (isIgnored(f.path)) continue;
      let topAuthor = "";
      let best = -1;
      for (const [a, n] of f.byAuthor) if (n > best) { best = n; topAuthor = a; }
      files.push({ id, path: f.path, lines: f.lines, churn: f.churn, topAuthor });
      lines += f.lines;
    }
    raw.push({ month: m, files, lines, commits: commitsInMonth, authors: authorsInMonth });
    commitsInMonth = 0;
    authorsInMonth = new Set();
  };

  for await (const c of commits) {
    // Author dates are not monotonic on a first-parent walk. Never go back.
    const cm = monthOf(c.time);
    if (month === undefined) month = cm;
    while (cm > month) {
      snapshot(month);
      month = nextMonth(month);
    }
    commitsInMonth++;
    authorsInMonth.add(c.author);

    for (const f of c.files) {
      const renamed = f.oldPath !== undefined && f.oldPath !== f.newPath;
      if (renamed && !idOf.has(f.oldPath!)) report.unknownRenames++;
      // A rename onto a live path replaces that file: drop its tile.
      const replaced = renamed ? idOf.get(f.newPath) : undefined;
      const id = resolveIdentity(idOf, f);
      if (replaced !== undefined && replaced !== id) live.delete(replaced);
      let s = live.get(id);
      if (!s) {
        s = { path: f.newPath, lines: 0, churn: 0, byAuthor: new Map() };
        live.set(id, s);
      }
      s.path = f.newPath;
      s.lines = Math.max(0, s.lines + f.added - f.deleted);
      const ch = f.added + f.deleted;
      s.churn += ch;
      s.byAuthor.set(c.author, (s.byAuthor.get(c.author) ?? 0) + ch);
    }
    for (const p of c.deletes) {
      const id = idOf.get(p);
      if (id === undefined) continue;
      idOf.delete(p);
      live.delete(id);
    }
  }
  if (month !== undefined) snapshot(month);
  return { repo, months: toFrames(raw, maxMonths) };
}

/**
 * Keep at most `maxMonths` frames, evenly spread. Each kept frame reports
 * churn, commits and authors for the whole period since the previous kept
 * frame, so the skipped months still count.
 */
function toFrames(raw: RawMonth[], maxMonths: number): MonthSnap[] {
  const keep = sampleIndices(raw.length, maxMonths);
  const prevChurn = new Map<string, number>();
  const out: MonthSnap[] = [];
  let from = 0;
  for (const k of keep) {
    let commits = 0;
    const authors = new Set<string>();
    for (let i = from; i <= k; i++) {
      commits += raw[i].commits;
      for (const a of raw[i].authors) authors.add(a);
    }
    from = k + 1;
    const r = raw[k];
    const files = r.files.map((f) => {
      const churn = f.churn - (prevChurn.get(f.id) ?? 0);
      prevChurn.set(f.id, f.churn);
      return { ...f, churn };
    });
    out.push({
      month: r.month,
      files,
      stats: { files: files.length, lines: r.lines, commits, authors: authors.size },
    });
  }
  return out;
}
