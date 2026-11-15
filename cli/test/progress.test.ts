import { describe, expect, it } from "vitest";
import type { Commit } from "../src/git.ts";
import { BIG_JSON_BYTES, sizeWarning, withProgress } from "../src/progress.ts";

async function* commits(n: number): AsyncGenerator<Commit> {
  for (let i = 0; i < n; i++) yield { hash: `h${i}`, time: i, author: "a", files: [], deletes: [] };
}

describe("withProgress", () => {
  it("passes every commit through and reports at the interval and at the end", async () => {
    let clock = 0;
    const calls: [number, boolean][] = [];
    const seen: string[] = [];
    // Each commit advances the clock 100 ms, so a 250 ms interval reports every third commit.
    for await (const c of withProgress(commits(7), (n, done) => calls.push([n, done]), 250, () => (clock += 100))) {
      seen.push(c.hash);
    }
    expect(seen).toHaveLength(7);
    expect(calls).toEqual([[3, false], [6, false], [7, true]]);
  });

  it("reports zero for an empty history", async () => {
    const calls: [number, boolean][] = [];
    for await (const _ of withProgress(commits(0), (n, done) => calls.push([n, done]))) void _;
    expect(calls).toEqual([[0, true]]);
  });
});

describe("sizeWarning", () => {
  it("is silent at or under the limit", () => {
    expect(sizeWarning(BIG_JSON_BYTES, 120)).toBeUndefined();
    expect(sizeWarning(6e6, 99)).toBeUndefined();
  });

  it("names the size and suggests --max-months that fits the limit", () => {
    // 165 MB at 120 frames is about 1.4 MB per frame, so 36 frames fit in 50 MB.
    expect(sizeWarning(165e6, 120)).toBe(
      "warning: the replay data is 165 MB, so the browser may be slow to load it. Use --max-months 36 for a smaller file.",
    );
  });

  it("never suggests fewer than 2 frames", () => {
    expect(sizeWarning(10e9, 10)).toMatch(/--max-months 2 /);
  });
});
