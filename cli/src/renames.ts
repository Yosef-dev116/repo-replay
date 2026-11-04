/**
 * Parse the path field of one `git log --numstat` line.
 *
 * With -M, git prints renames in two forms:
 *   old.ts => new.ts            (no shared prefix or suffix)
 *   src/{old => new}/x.ts       (brace form around the changed part)
 * Either side of the brace form can be empty: `src/{ => lib}/x.ts`.
 */
export interface PathChange {
  oldPath?: string;
  newPath: string;
}

const BRACE = /^(.*)\{(.*) => (.*)\}(.*)$/;

function clean(p: string): string {
  return p.replace(/\/{2,}/g, "/").replace(/^\//, "");
}

export function parseNumstatPath(field: string): PathChange {
  const brace = BRACE.exec(field);
  if (brace) {
    const [, prefix, left, right, suffix] = brace;
    return {
      oldPath: clean(prefix + left + suffix),
      newPath: clean(prefix + right + suffix),
    };
  }
  const arrow = field.indexOf(" => ");
  if (arrow !== -1) {
    return { oldPath: field.slice(0, arrow), newPath: field.slice(arrow + 4) };
  }
  return { newPath: field };
}
