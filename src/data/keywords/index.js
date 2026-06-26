import bsdata from "./bsdata-keywords.auto.json";
import factionPack from "./faction-pack-keywords.auto.json";
import overrides from "./manual-overrides.json";
import errata from "./errata-keywords.auto.json";
import { normalizeString } from "../../utils/name-match";

/**
 * Per-datasheet keyword overlay. Sourced from three layers, merged in
 * low-to-high priority order — the highest-priority source that names a
 * datasheet wins the whole keyword array (replace, not union — keeps each
 * source explicit and predictable).
 *
 *   1. `bsdata-keywords.auto.json` — broadest baseline. Auto-generated from
 *      BSData/wh40k-10e by `scripts/scrape-bsdata-keywords/`. Tracks main
 *      branch, refreshed via the bsdata-keywords-auto-update CI job.
 *      (When a BSData 11e repo eventually exists, slot it in between
 *      BSData 10e and the PDF layer here.)
 *
 *   2. `faction-pack-keywords.auto.json` — GW-authoritative *for what it
 *      contains*, which is intentionally narrow: GW strips a datasheet from
 *      the Faction Pack PDF once its codex ships, leaving only post-codex
 *      additions and errata in the PDF. So this layer covers maybe a quarter
 *      to a third of datasheets per faction — the fresh ones — and BSData
 *      (layer 1) supplies the codex-resident remainder. The PDFs are parsed
 *      by the LLM keyword pass in `scripts/scrape-faction-pack-11th/`.
 *
 *   3. `manual-overrides.json` — hand-curated escape hatch for cases all
 *      upstream sources get wrong. Always wins. Kept small via the
 *      audit + prune of `scripts/audit-and-prune-overrides.mjs`.
 *
 * Both layers are keyed by uppercase MFM faction name → datasheet name →
 * keyword array. Lookup-side normalization handles punctuation/casing drift
 * (apostrophes, hyphens, etc.) via `normalizeString`.
 */
export const KEYWORDS_BY_FACTION = buildLookup();
// Post-codex errata keyword deltas (Faction Pack "Rules Updates" sections),
// applied ON TOP of the resolved layers in getKeywordsFor. Unlike the layers
// (which replace the whole array), errata is an add/remove delta — a datasheet
// whose stat block is no longer in the pack still gets its corrected keywords
// (e.g. Aeldari Warlock Conclave losing CHARACTER; vehicles gaining FRAME).
const ERRATA_BY_FACTION = buildErrataLookup();

function buildLookup() {
  const out = new Map();
  // Order = priority (last write wins on conflict). Lowest priority first.
  applyLayer(out, bsdata);      // broad community baseline
  applyLayer(out, factionPack); // GW-authoritative, supersedes BSData
  applyLayer(out, overrides);   // explicit human fix, supersedes everything
  return out;
}

function buildErrataLookup() {
  const out = new Map();
  for (const [factionName, sheets] of Object.entries(errata)) {
    if (factionName.startsWith("_")) continue;
    if (!sheets || typeof sheets !== "object") continue;
    const factionMap = ensureFactionMap(out, factionName);
    for (const [sheetName, delta] of Object.entries(sheets)) {
      if (!delta || typeof delta !== "object") continue;
      factionMap.set(normalizeString(sheetName), {
        add: Array.isArray(delta.add) ? delta.add : [],
        remove: Array.isArray(delta.remove) ? delta.remove : [],
      });
    }
  }
  return out;
}

function applyLayer(root, layer) {
  for (const [factionName, sheets] of Object.entries(layer)) {
    if (factionName.startsWith("_")) continue;
    if (!sheets || typeof sheets !== "object") continue;
    const factionMap = ensureFactionMap(root, factionName);
    for (const [sheetName, keywords] of Object.entries(sheets)) {
      if (!Array.isArray(keywords)) continue;
      factionMap.set(normalizeString(sheetName), keywords);
    }
  }
}

function ensureFactionMap(root, factionName) {
  const key = normalizeString(factionName);
  if (!root.has(key)) root.set(key, new Map());
  return root.get(key);
}

/**
 * Look up the static keyword list for a datasheet. Returns an empty array when
 * the datasheet isn't covered by any layer — callers should treat absence as
 * "no keyword information," not "no keywords."
 */
export function getKeywordsFor(factionName, datasheetName) {
  if (!factionName || !datasheetName) return [];
  const factionMap = KEYWORDS_BY_FACTION.get(normalizeString(factionName));
  const base = factionMap?.get(normalizeString(datasheetName)) ?? [];

  const delta = ERRATA_BY_FACTION.get(normalizeString(factionName))?.get(
    normalizeString(datasheetName)
  );
  if (!delta) return base;

  // Apply the errata delta on a COPY (never mutate the cached layer array):
  // drop removed keywords, then append added ones not already present.
  const removed = new Set(delta.remove.map((k) => k.toUpperCase()));
  const result = base.filter((k) => !removed.has(k.toUpperCase()));
  const present = new Set(result.map((k) => k.toUpperCase()));
  for (const k of delta.add) {
    if (!present.has(k.toUpperCase())) {
      result.push(k);
      present.add(k.toUpperCase());
    }
  }
  return result;
}
