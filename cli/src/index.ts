import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildRepoJson, MAX_MONTHS, type BuildReport } from "./build.ts";
import { readCommits } from "./git.ts";
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

async function main() {
  const { values, positionals } = parseArgs({
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
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const repoDir = resolve(positionals[0] ?? ".");
  const maxMonths = Number(values["max-months"]);
  const name = values.name ?? basename(repoDir);

  const t0 = performance.now();
  const report: BuildReport = { unknownRenames: 0 };
  const data = await buildRepoJson(name, readCommits(repoDir), maxMonths, report);
  if (data.months.length === 0) throw new Error(`no commits found in ${repoDir}`);
  const json = JSON.stringify(data);
  const secs = ((performance.now() - t0) / 1000).toFixed(2);

  const last = data.months.at(-1);
  console.log(`repo:        ${name}`);
  console.log(`months:      ${data.months.length} (${data.months[0]?.month} .. ${last?.month})`);
  console.log(`files (last): ${last?.stats.files ?? 0}`);
  console.log(`lines (last): ${last?.stats.lines ?? 0}`);
  console.log(`renames from unknown path: ${report.unknownRenames}`);
  console.log(`time:        ${secs}s`);

  if (values.out) {
    const out = resolve(values.out);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, json);
    console.log(`output:      ${out} (${(json.length / 1e6).toFixed(1)} MB)`);
    return;
  }

  const fileName = `${basename(name).replace(/[^\w.-]/g, "_")}.json`;
  const url = await serve(VIEWER_DIR, fileName, json, Number(values.port));
  console.log(`\nReplay ready: ${url}`);
  console.log("Press Ctrl+C to stop.");
  if (values.open) openBrowser(url);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
