import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// These tests run the real CLI as a child process, as a user would.
const run = (args: string[], env: NodeJS.ProcessEnv = process.env) =>
  spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", ...args], {
    cwd: join(import.meta.dirname, ".."),
    encoding: "utf8",
    env,
  });

const gitIn = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { stdio: "ignore" });

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "repo-replay-test-"));
  mkdirSync(join(tmp, "empty"));
  gitIn(join(tmp, "empty"), "init", "-q");
  mkdirSync(join(tmp, "plain"));
  writeFileSync(join(tmp, "a-file"), "x");
  mkdirSync(join(tmp, "one"));
  gitIn(join(tmp, "one"), "init", "-q");
  writeFileSync(join(tmp, "one", "a.txt"), "1\n2\n");
  gitIn(join(tmp, "one"), "add", ".");
  gitIn(join(tmp, "one"), "commit", "-qm", "first");
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("CLI error messages", () => {
  const fails = (args: string[], message: RegExp, env?: NodeJS.ProcessEnv) => {
    const r = run(args, env);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(message);
    expect(r.stderr).not.toMatch(/fatal:|bug/);
    expect(r.stdout).toBe("");
  };

  it("reports a path that does not exist", () => fails([join(tmp, "nope")], /folder not found: .*nope/));
  it("reports a file instead of a folder", () => fails([join(tmp, "a-file")], /not a folder: .*a-file/));
  it("reports a folder that is not a git repo", () => fails([join(tmp, "plain")], /not a git repository: .*plain/));
  it("reports a repo with no commits", () => fails([join(tmp, "empty")], /no commits yet in .*empty/));
  it("reports more than one path", () => fails(["a", "b"], /expected one repo path, got 2/));
  it("reports an unknown option and points to --help", () => fails(["--bogus"], /Unknown option '--bogus'[\s\S]*--help/));
  it("reports a bad --max-months", () => fails([join(tmp, "one"), "--max-months", "1"], /--max-months must be/));
  it("reports a bad --port", () => fails([join(tmp, "one"), "--port", "70000"], /--port must be/));
  it("reports missing git", () => fails([join(tmp, "one")], /git is not installed/, { ...process.env, PATH: "/nonexistent" }));
});

describe("CLI on a repo with one commit", () => {
  it("writes one frame", () => {
    const out = join(tmp, "out", "one.json");
    const r = run([join(tmp, "one"), "-o", out]);
    expect(r.status).toBe(0);
    const data = JSON.parse(readFileSync(out, "utf8"));
    expect(data.months).toHaveLength(1);
    expect(data.months[0].files).toEqual([expect.objectContaining({ path: "a.txt", lines: 2 })]);
  });
});
