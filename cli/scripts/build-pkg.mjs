// Build the npm package: bundle the CLI into one file and copy in the built viewer.
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, rmSync } from "node:fs";
import { build } from "esbuild";

const cli = new URL("../", import.meta.url).pathname;
const root = new URL("../../", import.meta.url).pathname;

rmSync(cli + "dist", { recursive: true, force: true });
rmSync(cli + "viewer", { recursive: true, force: true });

await build({
  entryPoints: [cli + "src/index.ts"],
  outfile: cli + "dist/repo-replay.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
});
chmodSync(cli + "dist/repo-replay.js", 0o755);

// The viewer, without the demo data in web/public/data (the CLI serves its own).
execFileSync("npx", ["vite", "build", "--outDir", cli + "viewer", "--emptyOutDir"], { cwd: root + "web", stdio: "inherit" });
rmSync(cli + "viewer/data", { recursive: true, force: true });

// npm shows these on the package page.
copyFileSync(root + "README.md", cli + "README.md");
copyFileSync(root + "LICENSE", cli + "LICENSE");
