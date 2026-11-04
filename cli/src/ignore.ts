/**
 * Decide if a file is hidden from the treemap.
 *
 * The file is still tracked (identity, renames, line counts). It is only
 * left out of each month's snapshot. So a file moved out of an ignored
 * folder keeps its id and its history.
 *
 * `path` is repo-relative with forward slashes, e.g. "src/htmx.js".
 */

// Lockfiles: package-lock.json, yarn.lock, pnpm-lock.yaml, Cargo.lock, ...
// package-lock.json was 77% of htmx in Apr 2020.
const LOCKFILE = /(\.lock|-lock\.(json|ya?ml)|\.lockb)$/;

// Build output that is rebuilt on each release, e.g. htmx.min.js.
const MINIFIED = /\.min\.(js|css)$/;

// Files that look like secrets. Only the name would show, but hide it anyway.
const SECRET = /^\.env(\..+)?$|\.(pem|key|p12|pfx)$/;

// Folders that hold code no author writes by hand.
// www/static/node_modules was 73% of htmx in Jun 2021.
const IGNORED_DIRS = new Set(["node_modules", "vendor", "bower_components", "dist", "build"]);

// Frozen release copies, e.g. htmx's www/test/1.4.1/.
const VERSION_DIR = /^v?\d+\.\d+(\.\d+)?$/;

export function isIgnored(path: string): boolean {
  const parts = path.split("/");
  const name = parts.pop()!;
  if (LOCKFILE.test(name) || MINIFIED.test(name)) return true;
  if (SECRET.test(name) && !name.endsWith(".example")) return true;
  return parts.some((dir) => IGNORED_DIRS.has(dir) || VERSION_DIR.test(dir));
}
