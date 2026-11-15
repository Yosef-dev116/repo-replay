import type { Commit } from "./git.ts";

/**
 * Pass commits through, calling `report(count)` at most once per `intervalMs`
 * and once more with the final count. The CLI uses it to show progress on
 * long runs.
 */
export async function* withProgress(
  commits: AsyncIterable<Commit>,
  report: (count: number, done: boolean) => void,
  intervalMs = 500,
  now: () => number = () => performance.now(),
): AsyncGenerator<Commit> {
  let count = 0;
  let last = now();
  for await (const c of commits) {
    count++;
    const t = now();
    if (t - last >= intervalMs) {
      last = t;
      report(count, false);
    }
    yield c;
  }
  report(count, true);
}

/** Above this size, the browser takes many seconds to load the replay. */
export const BIG_JSON_BYTES = 50e6;

/**
 * A warning for a large replay file, with a --max-months value that brings it
 * near BIG_JSON_BYTES. Size grows about linearly with the number of frames.
 */
export function sizeWarning(bytes: number, frames: number): string | undefined {
  if (bytes <= BIG_JSON_BYTES) return undefined;
  const mb = (bytes / 1e6).toFixed(0);
  const suggest = Math.max(2, Math.floor((frames * BIG_JSON_BYTES) / bytes));
  return `warning: the replay data is ${mb} MB, so the browser may be slow to load it. Use --max-months ${suggest} for a smaller file.`;
}
