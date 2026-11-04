import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildRepoJson, MAX_MONTHS } from "./build.ts";
import { readCommits } from "./git.ts";

const USAGE = "usage: repo-replay <path-to-git-clone> -o <out.json> [--name owner/repo] [--max-months N]";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      name: { type: "string" },
      "max-months": { type: "string", default: String(MAX_MONTHS) },
    },
  });
  const repoDir = positionals[0];
  if (!repoDir || !values.out) {
    console.error(USAGE);
    process.exit(2);
  }
  const maxMonths = Number(values["max-months"]);
  const name = values.name ?? basename(resolve(repoDir));

  const t0 = performance.now();
  const data = await buildRepoJson(name, readCommits(repoDir), maxMonths);
  const out = resolve(values.out);
  await mkdir(dirname(out), { recursive: true });
  const json = JSON.stringify(data);
  await writeFile(out, json);
  const secs = ((performance.now() - t0) / 1000).toFixed(2);

  const last = data.months.at(-1);
  console.log(`repo:        ${name}`);
  console.log(`months:      ${data.months.length} (${data.months[0]?.month} .. ${last?.month})`);
  console.log(`files (last): ${last?.stats.files ?? 0}`);
  console.log(`lines (last): ${last?.stats.lines ?? 0}`);
  console.log(`output:      ${out} (${(json.length / 1e6).toFixed(1)} MB)`);
  console.log(`time:        ${secs}s`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
