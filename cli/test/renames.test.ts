import { describe, expect, it } from "vitest";
import { parseNumstatPath } from "../src/renames.ts";

describe("parseNumstatPath", () => {
  it("plain path", () => {
    expect(parseNumstatPath("src/index.ts")).toEqual({ newPath: "src/index.ts" });
  });
  it("arrow form without braces", () => {
    expect(parseNumstatPath("README => README.md")).toEqual({
      oldPath: "README",
      newPath: "README.md",
    });
  });
  it("brace form in the middle", () => {
    expect(parseNumstatPath("src/{old => new}/x.ts")).toEqual({
      oldPath: "src/old/x.ts",
      newPath: "src/new/x.ts",
    });
  });
  it("brace form at the start", () => {
    expect(parseNumstatPath("{lib => src}/x.ts")).toEqual({
      oldPath: "lib/x.ts",
      newPath: "src/x.ts",
    });
  });
  it("brace form on the file name", () => {
    expect(parseNumstatPath("src/{a.ts => b.ts}")).toEqual({
      oldPath: "src/a.ts",
      newPath: "src/b.ts",
    });
  });
  it("empty left side (move into a new folder)", () => {
    expect(parseNumstatPath("src/{ => helpers}/x.ts")).toEqual({
      oldPath: "src/x.ts",
      newPath: "src/helpers/x.ts",
    });
  });
  it("empty right side (move out of a folder)", () => {
    expect(parseNumstatPath("{deno => }/x.ts")).toEqual({
      oldPath: "deno/x.ts",
      newPath: "x.ts",
    });
  });
});
