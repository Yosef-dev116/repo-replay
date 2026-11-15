#!/usr/bin/env node
// Generate a large synthetic git repo for testing repo-replay at scale.
// usage: node scripts/gen-big-repo.mjs <dir> [commits=100000] [files=30000] [years=10]
// Uses git fast-import, so 100k commits take seconds, not hours.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, existsSync, readdirSync } from "node:fs";

const [dir, commitsArg = "100000", filesArg = "30000", yearsArg = "10"] = process.argv.slice(2);
if (!dir) {
  console.error("usage: node scripts/gen-big-repo.mjs <dir> [commits] [files] [years]");
  process.exit(1);
}
const COMMITS = Number(commitsArg);
const FILES = Number(filesArg);
const YEARS = Number(yearsArg);
if (existsSync(dir) && readdirSync(dir).length > 0) {
  console.error(`${dir} is not empty`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
execFileSync("git", ["init", "-q", "-b", "main", dir]);

const fi = spawn("git", ["-C", dir, "fast-import", "--quiet"], { stdio: ["pipe", "inherit", "inherit"] });
const write = (s) => (fi.stdin.write(s) ? Promise.resolve() : new Promise((r) => fi.stdin.once("drain", r)));

// Deterministic PRNG so runs are reproducible.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const pathOf = (i) => `pkg${i % 40}/mod${Math.floor(i / 40) % 50}/file${i}.ts`;
const lines = new Map(); // file index -> line count
const start = Math.floor(Date.UTC(2026 - YEARS, 0, 1) / 1000);
const span = YEARS * 365 * 86400;
const authors = Array.from({ length: 200 }, (_, i) => `Dev ${i} <dev${i}@example.com>`);
const body = (n) => Array.from({ length: n }, (_, k) => `line ${k}`).join("\n") + "\n";

let next = 0; // next file index to create
for (let c = 0; c < COMMITS; c++) {
  const t = start + Math.floor((c / COMMITS) * span);
  const who = authors[Math.floor(rand() * authors.length)];
  const ops = [];
  // Add new files at a steady rate so the tree reaches FILES by the end.
  const target = Math.floor(((c + 1) / COMMITS) * FILES);
  while (next < target) ops.push(next++);
  for (let k = 0; k < 3 && next > 0; k++) ops.push(Math.floor(rand() * next));
  let cmd = `commit refs/heads/main\nauthor ${who} ${t} +0000\ncommitter ${who} ${t} +0000\ndata 3\nc${c % 10}\n`;
  for (const i of ops) {
    const n = Math.max(1, (lines.get(i) ?? 0) + Math.floor(rand() * 20) - 5);
    lines.set(i, n);
    const b = body(Math.min(n, 400));
    cmd += `M 100644 inline ${pathOf(i)}\ndata ${Buffer.byteLength(b)}\n${b}`;
  }
  await write(cmd + "\n");
}
fi.stdin.end();
await new Promise((r, j) => fi.on("close", (code) => (code === 0 ? r() : j(new Error(`fast-import exited ${code}`)))));
console.log(`${dir}: ${COMMITS} commits, ${FILES} files over ${YEARS} years`);
