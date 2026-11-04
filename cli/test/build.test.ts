import { describe, expect, it } from "vitest";
import { buildRepoJson, sampleIndices } from "../src/build.ts";
import type { Commit, FileStat } from "../src/git.ts";

const t = (ym: string) => Date.parse(`${ym}-15T00:00:00Z`) / 1000;
let n = 0;
const commit = (ym: string, files: FileStat[], deletes: string[] = [], author = "a"): Commit => ({
  hash: `h${n++}`, time: t(ym), author, files, deletes,
});
const edit = (path: string, added: number, deleted = 0): FileStat => ({ newPath: path, added, deleted });
const move = (oldPath: string, newPath: string): FileStat => ({ oldPath, newPath, added: 0, deleted: 0 });

async function* feed(cs: Commit[]) { yield* cs; }
const build = (cs: Commit[], max?: number) => buildRepoJson("r", feed(cs), max);
const file = (m: { files: { path: string; lines: number; churn: number }[] }, path: string) =>
  m.files.find((f) => f.path === path);

describe("sampleIndices", () => {
  it("keeps everything when it fits", () => expect(sampleIndices(3, 5)).toEqual([0, 1, 2]));
  it("keeps first and last when sampling", () => {
    const s = sampleIndices(100, 10);
    expect(s).toHaveLength(10);
    expect(s[0]).toBe(0);
    expect(s.at(-1)).toBe(99);
  });
});

describe("buildRepoJson", () => {
  it("fills empty months between commits", async () => {
    const d = await build([commit("2024-01", [edit("a.ts", 10)]), commit("2024-04", [edit("a.ts", 5)])]);
    expect(d.months.map((m) => m.month)).toEqual(["2024-01", "2024-02", "2024-03", "2024-04"]);
    expect(file(d.months[1], "a.ts")).toMatchObject({ lines: 10, churn: 0 });
    expect(file(d.months[3], "a.ts")).toMatchObject({ lines: 15, churn: 5 });
  });

  it("adds churn and commits of skipped months to the next kept frame", async () => {
    const cs = ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05"].map((m) => commit(m, [edit("a.ts", 1)]));
    const d = await build(cs, 3); // keeps months 0, 2, 4
    expect(d.months.map((m) => m.month)).toEqual(["2024-01", "2024-03", "2024-05"]);
    expect(file(d.months[1], "a.ts")!.churn).toBe(2);
    expect(d.months[1].stats.commits).toBe(2);
  });

  it("drops the replaced tile when a rename lands on a live path", async () => {
    const d = await build([
      commit("2024-01", [edit("a.ts", 10), edit("b.ts", 20)]),
      commit("2024-02", [move("a.ts", "b.ts")]),
    ]);
    const last = d.months.at(-1)!;
    expect(last.files.map((f) => f.path)).toEqual(["b.ts"]);
    expect(last.files[0].lines).toBe(10);
  });

  it("removes deleted files", async () => {
    const d = await build([commit("2024-01", [edit("a.ts", 10)]), commit("2024-02", [edit("a.ts", 0, 10)], ["a.ts"])]);
    expect(d.months.at(-1)!.files).toEqual([]);
  });

  it("counts a commit dated in the future in the current month, not in the future", async () => {
    const d = await build([
      commit("2024-01", [edit("a.ts", 10)]),
      commit("2099-01", [edit("a.ts", 1)]),
      commit("2024-02", [edit("a.ts", 1)]),
    ]);
    expect(d.months.at(-1)!.month < "2099-01").toBe(true);
    expect(d.months.at(-1)!.stats.lines).toBe(12);
  });

  it("does not report a hidden file's old churn when it becomes visible", async () => {
    const d = await build([
      commit("2024-01", [edit("vendor/lib.js", 500), edit("main.js", 1)]),
      commit("2024-02", [edit("main.js", 1)]),
      commit("2024-03", [move("vendor/lib.js", "src/lib.js")]),
    ]);
    const last = d.months.at(-1)!;
    expect(file(last, "src/lib.js")).toMatchObject({ lines: 500, churn: 0 });
    expect(last.stats.lines).toBe(502);
  });
});
