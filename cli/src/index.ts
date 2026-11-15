import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildRepoJson, MAX_MONTHS, type BuildReport } from "./build.ts";
import type { RepoJson } from "./types.ts";
import { isShallow, readCommits } from "./git.ts";
import { checkRepo, UserError } from "./preflight.ts";
import { sizeWarning, withProgress } from "./progress.ts";
import { openBrowser, serve } from "./serve.ts";

const USAGE = `usage: repo-replay [path-to-git-repo] [options]

  Reads the repo's git history and opens an animated replay in your browser.
  The data stays on your machine.

options:
  -o, --out <file.json>  write the data to a file instead of opening the viewer
  --name <owner/repo>    name shown in the viewer (default: the folder name)
  --max-months <N>       maximum number of frames (default: ${MAX_MONTHS})
  --port <N>             port for the viewer (default: any free port)
  --no-open              print the URL but do not open a browser
  -h, --help             show this help`;

// In the package, the bundled CLI is dist/repo-replay.js and the viewer is viewer/.
// When run from source, src/index.ts sits at the same depth, so the same path works.
const VIEWER_DIR = fileURLToPath(new URL("../viewer/", import.meta.url));

function parseCli() {
  try {
    return parseArgs({
      allowPositionals: true,
      allowNegative: true,
      options: {
        out: { type: "string", short: "o" },
        name: { type: "string" },
        "max-months": { type: "string", default: String(MAX_MONTHS) },
        port: { type: "string", default: "0" },
        open: { type: "boolean", default: true },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (err) {
    // node:util parseArgs errors carry a code like ERR_PARSE_ARGS_UNKNOWN_OPTION.
    if ((err as NodeJS.ErrnoException).code?.startsWith("ERR_PARSE_ARGS")) {
      throw new UserError(`${(err as Error).message}\nRun "repo-replay --help" to see the options.`);
    }
    throw err;
  }
}

async function main() {
  const { values, positionals } = parseCli();
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (positionals.length > 1) {
    throw new UserError(`expected one repo path, got ${positionals.length}: ${positionals.join(" ")}\nRun "repo-replay --help" for usage.`);
  }
  const repoDir = resolve(positionals[0] ?? ".");
  const maxMonths = Number(values["max-months"]);
  if (!Number.isInteger(maxMonths) || maxMonths < 2) throw new UserError("--max-months must be a whole number, 2 or more");
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new UserError("--port must be a whole number from 0 to 65535");
  checkRepo(repoDir);
  // Check the output and the port before reading history, which can take a while on a big repo.
  const out = values.out ? resolve(values.out) : undefined;
  if (out) await prepareOut(out);
  else if (port !== 0) await checkPort(port);
  if (isShallow(repoDir)) {
    console.warn('warning: shallow clone, so the history is cut off. Run "git fetch --unshallow" for the full replay.');
  }
  const name = values.name ?? basename(repoDir);

  const t0 = performance.now();
  const report: BuildReport = { unknownRenames: 0 };
  // Progress goes to stderr, and only on a terminal, so piped output and CI logs stay clean.
  const progress = process.stderr.isTTY
    ? (n: number, done: boolean) => process.stderr.write(done ? "\r\x1b[K" : `\rreading history: ${n.toLocaleString("en-US")} commits`)
    : () => {};
  const data = await buildRepoJson(name, withProgress(readCommits(repoDir), progress), maxMonths, report);
  if (data.months.length === 0) throw new Error(`no commits found in ${repoDir}`);
  const json = toJson(data);
  const secs = ((performance.now() - t0) / 1000).toFixed(2);

  const last = data.months.at(-1);
  console.log(`repo:        ${name}`);
  console.log(`months:      ${data.months.length} (${data.months[0]?.month} .. ${last?.month})`);
  console.log(`files (last): ${last?.stats.files ?? 0}`);
  console.log(`lines (last): ${last?.stats.lines ?? 0}`);
  console.log(`renames from unknown path: ${report.unknownRenames}`);
  console.log(`time:        ${secs}s`);

  const warning = sizeWarning(Buffer.byteLength(json), data.months.length);
  if (warning) console.warn(warning);

  if (out) {
    await writeFile(out, json).catch((err) => outError(out, err));
    console.log(`output:      ${out} (${(Buffer.byteLength(json) / 1e6).toFixed(1)} MB)`);
    return;
  }

  const fileName = `${basename(name).replace(/[^\w.-]/g, "_")}.json`;
  const url = await serve(VIEWER_DIR, fileName, json, port).catch((err) => portError(port, err));
  console.log(`\nReplay ready: ${url}`);
  console.log("Press Ctrl+C to stop.");
  if (values.open) openBrowser(url);
}

/** Make the output's folder and check that the output path is not a folder. */
async function prepareOut(out: string): Promise<void> {
  await mkdir(dirname(out), { recursive: true }).catch((err) => outError(out, err));
  const st = await stat(out).catch(() => undefined);
  if (st?.isDirectory()) throw new UserError(`-o ${out} is a folder. Pass a file name, such as ${join(out, "replay.json")}.`);
}

function outError(out: string, err: unknown): never {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") throw new UserError(`cannot write ${out}: permission denied. Pick another -o path.`);
  if (code === "ENOTDIR" || code === "EEXIST") throw new UserError(`cannot write ${out}: part of that path is a file, not a folder. Pick another -o path.`);
  if (code === "EISDIR") throw new UserError(`-o ${out} is a folder. Pass a file name, such as ${join(out, "replay.json")}.`);
  throw err;
}

/** Fail early when a fixed --port is taken, instead of after reading the whole history. */
async function checkPort(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", ok);
  }).catch((err) => portError(port, err));
  await new Promise((done) => server.close(done));
}

function portError(port: number, err: unknown): never {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "EADDRINUSE") throw new UserError(`port ${port} is already in use. Pick another --port, or leave it out to use any free port.`);
  if (code === "EACCES") throw new UserError(`no permission to use port ${port}. Use a port above 1023, or leave --port out.`);
  throw err;
}

/** JSON.stringify, with a clear error when the data passes V8's string size limit (about 512 MB). */
function toJson(data: RepoJson): string {
  try {
    return JSON.stringify(data);
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    const frames = data.months.length;
    throw new UserError(`this repo's replay is too big to build (over 500 MB of data with ${frames} frames). Use --max-months ${Math.max(2, Math.floor(frames / 4))} or lower.`);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`repo-replay: ${msg}`);
  if (!(err instanceof UserError)) {
    console.error("This looks like a bug. Please report it: https://github.com/Yosef-dev116/repo-replay/issues");
  }
  process.exit(1);
});
