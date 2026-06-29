import enhancementRestrictionsAuto from "./enhancement-restrictions.auto.json";
import enhancementRestrictionsBsdata from "./enhancement-restrictions.bsdata.auto.json";
import enhancementRestrictionsManual from "./enhancement-restrictions.manual.json";
import wargearRestrictionsBsdata from "./wargear-restrictions.bsdata.auto.json";
import { normalizeString } from "../../utils/name-match";

/**
 * Faction → enhancement-name → per-enhancement restriction object, sourced
 * from three layers and consulted in priority order:
 *
 *   1. `enhancement-restrictions.manual.json` — hand-curated overrides, always
 *      wins. Escape hatch for cases the scrapers can't get right.
 *   2. `enhancement-restrictions.auto.json` — LLM-scraped from the official
 *      Faction Pack PDFs by `scripts/scrape-mfm-11th/`. GW-authoritative for
 *      whatever appears in the post-codex/errata PDF — when a layer 2 entry
 *      exists, it beats anything BSData has, since GW errata supersedes the
 *      community-maintained codex transcription.
 *   3. `enhancement-restrictions.bsdata.auto.json` — derived from BSData
 *      catalogue XML conditions (`<modifier>` + `<condition scope="ancestor">`)
 *      by `scripts/scrape-bsdata-enhancements/`. Fills the codex-resident gap
 *      MFM-PDF can't see — once a codex ships, GW strips its enhancements
 *      from the Faction Pack PDF, but BSData carries them.
 *
 * Only deviations from the universal defaults are stored — every enhancement is
 * CHARACTER-only and excluded from EPIC HEROES unless a field below says
 * otherwise. Each entry may set any subset of:
 *   - nonCharacterOnly: boolean — host must NOT carry the CHARACTER keyword
 *                       (used for "Upgrade"-tagged enhancements)
 *   - allowedHosts:     string[] — host datasheet name must be in this list
 *                       (also suppresses the CHARACTER / EPIC HERO defaults for
 *                       the named hosts)
 *   - requiredKeywords: string[] — every keyword must be present on the host
 *                       datasheet's keyword set (sourced via the BSData
 *                       overlay + manual overrides at `src/data/keywords/`)
 *   - limit:            number — max copies of this enhancement in the army
 *   - autoTake:         string[] — reserved; future auto-attach behavior
 *
 * Keys starting with "_" (e.g. "_comment") are ignored — used for inline doc
 * notes in the JSON file.
 */
function stripUnderscoreKeys(obj) {
  return Object.fromEntries(
    Object.entries(obj ?? {}).filter(([k]) => !k.startsWith("_"))
  );
}

export const ENHANCEMENT_RESTRICTIONS = stripUnderscoreKeys(enhancementRestrictionsAuto);
const ENHANCEMENT_RESTRICTIONS_BSDATA = stripUnderscoreKeys(enhancementRestrictionsBsdata);
const ENHANCEMENT_RESTRICTIONS_MANUAL = stripUnderscoreKeys(enhancementRestrictionsManual);

// Index a faction→enhancement table under normalized keys so lookups don't
// depend on byte-exact faction/enhancement names matching across the MFM
// source and the various JSON layers (apostrophe / diacritic / Unicode-form
// drift, e.g. "TL-4ø9", "Vingh's…"). Mirrors the normalized keyword lookup in
// src/data/keywords/index.js. First writer wins; raw tables shouldn't collide
// under normalizeString.
function buildNormalizedIndex(table) {
  const index = new Map();
  for (const [faction, entries] of Object.entries(table ?? {})) {
    if (!entries || typeof entries !== "object") continue;
    const fkey = normalizeString(faction);
    let inner = index.get(fkey);
    if (!inner) index.set(fkey, (inner = new Map()));
    for (const [name, entry] of Object.entries(entries)) {
      const nkey = normalizeString(name);
      if (!inner.has(nkey)) inner.set(nkey, entry);
    }
  }
  return index;
}

const ENH_INDEX_AUTO = buildNormalizedIndex(ENHANCEMENT_RESTRICTIONS);
const ENH_INDEX_BSDATA = buildNormalizedIndex(ENHANCEMENT_RESTRICTIONS_BSDATA);
const ENH_INDEX_MANUAL = buildNormalizedIndex(ENHANCEMENT_RESTRICTIONS_MANUAL);

function readEntry(index, factionName, enhancementName) {
  const inner = index.get(normalizeString(factionName));
  if (!inner) return null;
  const entry = inner.get(normalizeString(enhancementName));
  if (!entry) return null;
  // Legacy shape (an array) was a bare allowed-hosts whitelist. Promote to
  // the object shape so callers only deal with one form.
  if (Array.isArray(entry)) {
    return entry.length > 0 ? { allowedHosts: entry } : null;
  }
  if (typeof entry !== "object") return null;
  return entry;
}

export function getEnhancementRestrictions(factionName, enhancementName) {
  if (!factionName || !enhancementName) return null;
  return (
    readEntry(ENH_INDEX_MANUAL, factionName, enhancementName) ??
    readEntry(ENH_INDEX_AUTO, factionName, enhancementName) ??
    readEntry(ENH_INDEX_BSDATA, factionName, enhancementName) ??
    null
  );
}

/**
 * Faction → datasheet → wargear-option-name → { maxPerUnit } map, scraped
 * from BSData by `scripts/scrape-bsdata-wargear/`. Consumed at MFM parse
 * time to populate `option.maxPerUnit` on each `wargearOptions[]` entry,
 * which the runtime (`src/utils/wargear-limits.js`) already honors via
 * `wargearMaxPerUnit()`. Options without a BSData-derived cap fall back
 * to the existing 20-per-host placeholder.
 */
const WARGEAR_RESTRICTIONS_BSDATA = stripUnderscoreKeys(wargearRestrictionsBsdata);

export function getWargearRestrictions(factionName, datasheetName) {
  if (!factionName || !datasheetName) return null;
  const factionEntry = WARGEAR_RESTRICTIONS_BSDATA?.[factionName];
  if (!factionEntry || typeof factionEntry !== "object") return null;
  const datasheetEntry = factionEntry[datasheetName];
  if (!datasheetEntry || typeof datasheetEntry !== "object") return null;
  return datasheetEntry;
}
