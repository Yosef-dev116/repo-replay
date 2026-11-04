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
 * Edge cases to decide:
 *   - rename whose oldPath is not in map (history starts mid-rename, or the
 *     old file was created on a branch we did not replay)
 *   - rename onto a path that already has an id
 */
export function resolveIdentity(
  map: Map<string, string>,
  change: { oldPath?: string; newPath: string },
): string {
  // TODO(user): implement. See the tests in test/identity.test.ts.
  throw new Error("not implemented");
}
