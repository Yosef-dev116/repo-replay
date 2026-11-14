import type { FileSnap } from '../../cli/src/types.ts'

/** Files the treemap draws: binary and emptied files have no area. */
export const visibleFiles = (files: FileSnap[]) => files.filter((f) => f.lines > 0)
