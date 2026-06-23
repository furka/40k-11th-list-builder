import { getKeywordsFor } from "../data/keywords";
import { conditionalBattlelineUnits } from "./conditional-battleline";

/**
 * Role-membership primitives over per-datasheet keyword lists.
 *
 * `getKeywords(sheet)` returns the static keyword set baked onto the datasheet
 * at parse time (BSData overlay ∪ manual overrides). Most callers (CHARACTER,
 * EPIC HERO, INFANTRY, faction tags, …) use this.
 *
 * `getEffectiveKeywords(sheet, list)` unions the static set with the dynamic
 * BATTLELINE grants — detachment-triggered (`conditional-battleline.auto.json`)
 * and user-applied (`list.bonusBattleline`). BATTLELINE-sensitive call sites
 * (codex grouping, sort ordering, unit-cap doubling) use this so detachment
 * changes flow through without mutating the underlying datasheet.
 *
 * `hasKeyword(sheet, keyword, list?)` is sugar: with `list`, dynamic-aware;
 * without, static-only. Both are case-sensitive — keywords are stored
 * uppercased (matches `requiredKeywords` in enhancement-restrictions.auto.json
 * and the MFM-side faction naming convention).
 */

export function getKeywords(sheet) {
  if (!sheet) return new Set();
  const list = sheet.keywords;
  if (Array.isArray(list) && list.length > 0) return new Set(list);
  // Fallback for datasheets the merge layer didn't touch (e.g. the
  // synthetic "Enhancements" sheet). No keywords → caller treats as untagged.
  return new Set();
}

export function getEffectiveKeywords(sheet, list) {
  const base = getKeywords(sheet);
  if (!list || !sheet?.name) return base;
  const grants = conditionalBattlelineUnits(list);
  if (grants.has(sheet.name)) base.add("BATTLELINE");
  return base;
}

export function hasKeyword(sheet, keyword, list = null) {
  if (!sheet || !keyword) return false;
  const set = list ? getEffectiveKeywords(sheet, list) : getKeywords(sheet);
  return set.has(keyword);
}

/**
 * Lookup helper used by the merge layer (data-reader-11th.js) to attach the
 * keyword array onto a parsed datasheet. Re-exports `getKeywordsFor` so
 * downstream modules don't reach into `src/data/keywords` directly.
 */
export { getKeywordsFor } from "../data/keywords";
