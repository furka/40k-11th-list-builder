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
 * Walk up `attachedTo` from `unit` to find the topmost ancestor — the root of
 * the attached unit (a Leader + its Bodyguard + any sub-attachments all share
 * one root). Guarded against cycles by tracking visited ids. Returns the
 * starting unit's id when `unit` is not attached to anything.
 */
export function attachedUnitRootId(unit, units) {
  if (!unit) return null;
  const byId = new Map(units.map((u) => [u.id, u]));
  let cursor = unit;
  const seen = new Set();
  while (cursor?.attachedTo && byId.has(cursor.attachedTo)) {
    if (seen.has(cursor.id)) break;
    seen.add(cursor.id);
    cursor = byId.get(cursor.attachedTo);
  }
  return cursor?.id ?? null;
}

/**
 * Count enhancement units anywhere in the attached unit rooted at `rootId`,
 * i.e. the full subtree linked by `attachedTo`. `excludeId` is omitted from
 * the count (used by drop-time legality to self-exempt the dragged unit, and
 * by post-hoc validation to surface only the OVERFLOW copies).
 *
 * Rule source: 25.04 "No unit (including attached units) can have more than
 * one enhancement."
 */
export function countEnhancementsInAttachedUnit(rootId, units, excludeId = null) {
  if (!rootId) return 0;
  const byParent = new Map();
  for (const u of units) {
    const p = u.attachedTo ?? null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(u);
  }
  let count = 0;
  const stack = [rootId];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = units.find((u) => u.id === id);
    if (node && node.id !== excludeId && isEnhancementUnit(node)) count++;
    for (const child of byParent.get(id) ?? []) stack.push(child.id);
  }
  return count;
}

/**
 * Returns a short user-facing error string if `unit` is attached to an
 * invalid host, or `null` if the attachment is fine (or there is none).
 */
export function attachedToError(unit, host, getDataSheet) {
  if (!unit.attachedTo) return null;
  if (!host) return "Attached to a missing unit";

  // A manual free-attach override (set at drop time) intentionally ignores the
  // normal restrictions, so it must not surface a red error.
  if (unit.forcedAttach) return null;

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
