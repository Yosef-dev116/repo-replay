import { describe, expect, it } from "vitest";
import { isIgnored } from "../src/ignore.ts";

describe("isIgnored", () => {
  it.each([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "rust/Cargo.lock",
    "www/static/node_modules/mocha/mocha.js",
    "vendor/lib.go",
    "dist/htmx.js",
    "packages/zod/build/index.js",
    "src/ext/htmx.min.js",
    "www/test/1.4.1/core/ajax.js",
    "docs/v2.0.0/index.md",
    ".env",
    "config/.env.production",
    "certs/server.pem",
  ])("hides %s", (p) => expect(isIgnored(p)).toBe(true));

  it.each([
    "src/htmx.js",
    "README.md",
    "packages/zod/src/v4/core/schemas.ts", // "v4" alone is not a version folder
    "docs/node_modules-guide.md", // name contains the text, but is not the folder
    "src/build.ts", // a file named build, not a build/ folder
    "src/lock.ts",
    "test/1.4.1.js", // version-like file name, not a folder
    ".env.example", // a template, not a secret
  ])("keeps %s", (p) => expect(isIgnored(p)).toBe(false));
});
