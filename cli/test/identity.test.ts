import { describe, expect, it } from "vitest";
import { resolveIdentity } from "../src/identity.ts";
import { parseNumstatPath } from "../src/renames.ts";

describe("resolveIdentity", () => {
  it("plain add gives a new id and records it", () => {
    const map = new Map<string, string>();
    const id = resolveIdentity(map, { newPath: "a.ts" });
    expect(typeof id).toBe("string");
    expect(map.get("a.ts")).toBe(id);
  });

  it("two adds give two different ids", () => {
    const map = new Map<string, string>();
    const a = resolveIdentity(map, { newPath: "a.ts" });
    const b = resolveIdentity(map, { newPath: "b.ts" });
    expect(a).not.toBe(b);
  });

  it("modify of a known path keeps the id", () => {
    const map = new Map<string, string>();
    const id = resolveIdentity(map, { newPath: "a.ts" });
    expect(resolveIdentity(map, { newPath: "a.ts" })).toBe(id);
  });

  it("rename keeps the id and moves it to the new path", () => {
    const map = new Map<string, string>();
    const id = resolveIdentity(map, { newPath: "a.ts" });
    expect(resolveIdentity(map, { oldPath: "a.ts", newPath: "b.ts" })).toBe(id);
    expect(map.get("b.ts")).toBe(id);
    expect(map.has("a.ts")).toBe(false);
  });

  it("chain a -> b -> c keeps one id", () => {
    const map = new Map<string, string>();
    const id = resolveIdentity(map, { newPath: "a.ts" });
    resolveIdentity(map, { oldPath: "a.ts", newPath: "b.ts" });
    expect(resolveIdentity(map, { oldPath: "b.ts", newPath: "c.ts" })).toBe(id);
    expect([...map.keys()]).toEqual(["c.ts"]);
  });

  it("delete then re-add at the same path gives a new id", () => {
    const map = new Map<string, string>();
    const first = resolveIdentity(map, { newPath: "a.ts" });
    map.delete("a.ts"); // the caller does this on a git delete
    const second = resolveIdentity(map, { newPath: "a.ts" });
    expect(second).not.toBe(first);
    expect(map.get("a.ts")).toBe(second);
  });

  it("new file at a renamed-away path does not steal the old id", () => {
    const map = new Map<string, string>();
    const id = resolveIdentity(map, { newPath: "a.ts" });
    resolveIdentity(map, { oldPath: "a.ts", newPath: "b.ts" });
    const fresh = resolveIdentity(map, { newPath: "a.ts" });
    expect(fresh).not.toBe(id);
    expect(map.get("b.ts")).toBe(id);
  });

  it("works with the numstat brace syntax src/{old => new}/x.ts", () => {
    const map = new Map<string, string>();
    const id = resolveIdentity(map, { newPath: "src/old/x.ts" });
    const change = parseNumstatPath("src/{old => new}/x.ts");
    expect(resolveIdentity(map, change)).toBe(id);
    expect(map.get("src/new/x.ts")).toBe(id);
  });
});
