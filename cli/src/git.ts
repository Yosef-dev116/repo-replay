import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { parseNumstatPath, type PathChange } from "./renames.ts";

export interface FileStat extends PathChange {
  added: number; // 0 for binary files ("-")
  deleted: number;
}

export interface Commit {
  hash: string;
  time: number; // author time, unix seconds
  author: string;
  files: FileStat[];
  deletes: string[]; // paths removed by this commit
}

const MARK = "\u0001C\u0001";

/**
 * Stream the main-branch history oldest-first.
 *
 * --first-parent with --diff-merges=first-parent diffs each merge against
 * the previous main-branch state. So the per-file totals add up to the real
 * tree, and side-branch renames do not collide.
 */
export async function* readCommits(repoDir: string): AsyncGenerator<Commit> {
  const args = [
    "-C", repoDir,
    "-c", "core.quotePath=false",
    "log", "--reverse", "--first-parent", "--diff-merges=first-parent",
    "-M", "--numstat", "--summary",
    `--format=${MARK}%H%x09%at%x09%aN`,
  ];
  const git = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  git.stderr.on("data", (d) => (stderr += d));
  const exited = new Promise<number>((r) => git.on("close", (code) => r(code ?? 1)));

  let cur: Commit | undefined;
  for await (const line of createInterface({ input: git.stdout, crlfDelay: Infinity })) {
    if (line.startsWith(MARK)) {
      if (cur) yield cur;
      const [hash, time, author] = line.slice(MARK.length).split("\t");
      cur = { hash, time: Number(time), author, files: [], deletes: [] };
      continue;
    }
    if (!cur || line === "") continue;
    if (line.startsWith(" delete mode ")) {
      // " delete mode 100644 path/to/file"
      cur.deletes.push(line.slice(" delete mode ".length).replace(/^\d+ /, ""));
      continue;
    }
    if (line.startsWith(" ")) continue; // create/rename/mode summary lines
    const tab1 = line.indexOf("\t");
    const tab2 = line.indexOf("\t", tab1 + 1);
    if (tab1 < 0 || tab2 < 0) continue;
    const a = line.slice(0, tab1);
    const d = line.slice(tab1 + 1, tab2);
    cur.files.push({
      ...parseNumstatPath(line.slice(tab2 + 1)),
      added: a === "-" ? 0 : Number(a),
      deleted: d === "-" ? 0 : Number(d),
    });
  }
  if (cur) yield cur;
  const code = await exited;
  if (code !== 0) throw new Error(`git log failed (${code}): ${stderr.trim()}`);
}
