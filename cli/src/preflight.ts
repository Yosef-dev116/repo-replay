import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";

/** An error whose message is meant for the user as is. */
export class UserError extends Error {}

/** Run git quietly. Returns stdout, or undefined when git exits non-zero. */
function git(args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UserError("git is not installed or not on your PATH. Install git, then try again.");
    }
    return undefined;
  }
}

/**
 * Check that `dir` is a git repo with at least one commit, before reading history.
 * Each failure throws a UserError with one plain sentence and the next step.
 */
export function checkRepo(dir: string): void {
  let isDir: boolean;
  try {
    isDir = statSync(dir).isDirectory();
  } catch {
    throw new UserError(`folder not found: ${dir}`);
  }
  if (!isDir) throw new UserError(`not a folder: ${dir}. Pass the folder that holds the repo.`);
  if (git(["--version"]) === undefined) {
    throw new UserError("git is not installed or not on your PATH. Install git, then try again.");
  }
  if (git(["-C", dir, "rev-parse", "--git-dir"]) === undefined) {
    throw new UserError(`not a git repository: ${dir}. Run repo-replay inside a git repo, or pass its path.`);
  }
  if (git(["-C", dir, "rev-parse", "--verify", "--quiet", "HEAD"]) === undefined) {
    throw new UserError(`no commits yet in ${dir}. Make a commit first, then run repo-replay again.`);
  }
}
