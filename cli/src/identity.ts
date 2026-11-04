/**
 * Give each file a stable id that survives renames.
 *
 * `map` is the live state: current path -> id, for every file that exists
 * now. The caller removes a path from `map` when git deletes the file.
 *
 * Called once for every numstat entry, in commit order:
 *   - modify:  { newPath }           path already in map -> keep its id
 *   - add:     { newPath }           path not in map     -> new unique id
 *   - rename:  { oldPath, newPath }  move the id from oldPath to newPath
 *
 * Must return the id and leave `map` updated. Ids must stay unique over the
 * whole run: a path that was deleted and later re-added is a new file and
 * gets a new id. The treemap uses the id as the D3 join key, so a reused id
 * would make a dead tile come back to life in the wrong place.
 *
 * Edge cases:
 *   - rename whose oldPath is not in map: treat it as an add with a new id.
 *     The caller counts these cases.
 *   - rename onto a path that already has an id: the moved id wins, and the
 *     old id at that path is dropped. The caller removes its tile.
 */
let next = 0; // never resets, so ids stay unique for the whole process

export function resolveIdentity(
  map: Map<string, string>,
  change: { oldPath?: string; newPath: string },
): string {
  const { oldPath, newPath } = change;
  let id = oldPath === undefined ? undefined : map.get(oldPath);
  if (id !== undefined) map.delete(oldPath!); // rename: move the id
  id ??= map.get(newPath) ?? `f${next++}`; // modify keeps, add gets new
  map.set(newPath, id); // a moved id overwrites any id at newPath
  return id;
}
