import enhancementRestrictionsAuto from "./enhancement-restrictions.auto.json";
import enhancementRestrictionsBsdata from "./enhancement-restrictions.bsdata.auto.json";
import enhancementRestrictionsManual from "./enhancement-restrictions.manual.json";

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
 * Each entry may set any subset of:
 *   - characterOnly:    boolean — host must carry the CHARACTER keyword
 *                       (NOTE: now redundant with the universal default —
 *                       runtime ignores this flag)
 *   - nonCharacterOnly: boolean — host must NOT carry the CHARACTER keyword
 *                       (used for "Upgrade"-tagged enhancements)
 *   - notOnEpicHeroes:  boolean — host must NOT carry the EPIC HERO keyword
 *                       (NOTE: now redundant — universal default blocks
 *                       EPIC HEROES unless host is in allowedHosts)
 *   - allowedHosts:     string[] — host datasheet name must be in this list
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

function readEntry(table, factionName, enhancementName) {
  const factionEntry = table?.[factionName];
  if (!factionEntry || typeof factionEntry !== "object") return null;
  const entry = factionEntry[enhancementName];
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
    readEntry(ENHANCEMENT_RESTRICTIONS_MANUAL, factionName, enhancementName) ??
    readEntry(ENHANCEMENT_RESTRICTIONS, factionName, enhancementName) ??
    readEntry(ENHANCEMENT_RESTRICTIONS_BSDATA, factionName, enhancementName) ??
    null
  );
}
