import { getEffectiveKeywords } from "./keywords";

/**
 * Battleline check that respects detachment-conditional grants and the
 * user's manual `bonusBattleline` overrides. Pass the active armyList (via
 * `armyListStore.toObject()`) so the dynamic union runs.
 *
 * Calling without a list falls back to the static BSData keyword set —
 * intentionally less accurate, but safe for code paths that don't have the
 * list in hand (e.g. cold-path UI bits that never see detachment-granted
 * battleline anyway).
 */
export function isBattleLine(sheet, list = null) {
  return getEffectiveKeywords(sheet, list).has("BATTLELINE");
}
