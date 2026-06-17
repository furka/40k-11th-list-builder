/**
 * Per-unit limits for wargear options.
 *
 * The MFM HTML doesn't expose per-option caps in a machine-readable way, so
 * the codex uses a placeholder constant for now. The data schema reserves
 * an optional `maxPerUnit` on each `wargearOptions` entry — when a real
 * source for those numbers becomes available, populate that field per option
 * and this module starts honoring them automatically.
 */

export const WARGEAR_DEFAULT_MAX_PER_UNIT = 20;

export function wargearMaxPerUnit(option) {
  return option?.maxPerUnit ?? WARGEAR_DEFAULT_MAX_PER_UNIT;
}

/**
 * How many copies of `optionName` are already attached to `hostId`. The
 * `excludeId` knob lets drag/validate code answer "does ANOTHER copy fill
 * the cap?" — e.g. the dragged wargear's own row is excluded so dropping
 * it back on its current host doesn't see itself as a blocker.
 */
export function wargearCountOn(units, hostId, optionName, excludeId) {
  let n = 0;
  for (const u of units) {
    if (u.name !== "Wargear") continue;
    if (u.attachedTo !== hostId) continue;
    if (u.optionName !== optionName) continue;
    if (excludeId && u.id === excludeId) continue;
    n++;
  }
  return n;
}

/**
 * Pick the first host of `datasheetName` in array order whose current count
 * of `optionName` is below `max`. Returns null when every matching host is
 * already at the cap — the codex card uses that to grey out the click.
 */
export function findAvailableWargearHost(units, datasheetName, optionName, max) {
  for (const u of units) {
    if (u.name !== datasheetName) continue;
    if (wargearCountOn(units, u.id, optionName) < max) return u;
  }
  return null;
}
