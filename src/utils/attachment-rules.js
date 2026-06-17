/**
 * Post-hoc attachment validation. Used by `armyList.getUnitValidationError`
 * to surface red errors on units whose attachment is illegal — e.g., from
 * a shared list URL with stale data, or from before drop-time enforcement
 * tightened.
 *
 * Drop-time legality (what slots accept which drag) lives in
 * `legal-drop-slots.js`. The two paths agree on the rules; they just run
 * at different moments.
 */

export function isEnhancementUnit(unit) {
  return unit?.name === "Enhancements";
}

export function isWargearUnit(unit) {
  return unit?.name === "Wargear";
}

/**
 * Returns a short user-facing error string if `unit` is attached to an
 * invalid host, or `null` if the attachment is fine (or there is none).
 */
export function attachedToError(unit, host, getDataSheet) {
  if (!unit.attachedTo) return null;
  if (!host) return "Attached to a missing unit";

  if (isEnhancementUnit(unit)) return null;

  if (isWargearUnit(unit)) {
    if (host.name !== unit.parentDataSheet) {
      return `Wargear belongs to ${unit.parentDataSheet}`;
    }
    return null;
  }

  const ds = getDataSheet(unit.name);
  if (!ds) return null;

  if (ds.leader?.attachesTo?.length) {
    if (!ds.leader.attachesTo.includes(host.name)) {
      return `Leader can only attach to: ${ds.leader.attachesTo.join(", ")}`;
    }
    return null;
  }
  if (ds.support?.attachesTo?.length) {
    if (!ds.support.attachesTo.includes(host.name)) {
      return `Support can only attach to: ${ds.support.attachesTo.join(", ")}`;
    }
    return null;
  }

  return "This unit can't be attached to another";
}
