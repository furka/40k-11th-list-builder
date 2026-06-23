import enhancementRestrictionsAuto from "./enhancement-restrictions.auto.json";

/**
 * Faction → enhancement-name → per-enhancement restriction object, scraped
 * from the official Faction Pack PDFs by `scripts/scrape-mfm-11th/`. The
 * scraper is the single source of truth — if an entry here is wrong, fix the
 * scraper and re-run it, don't patch the JSON.
 *
 * Each entry may set any subset of:
 *   - characterOnly:    boolean — host must carry the CHARACTER keyword
 *   - nonCharacterOnly: boolean — host must NOT carry the CHARACTER keyword
 *   - notOnEpicHeroes:  boolean — host must NOT carry the EPIC HERO keyword
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
export const ENHANCEMENT_RESTRICTIONS = Object.fromEntries(
  Object.entries(enhancementRestrictionsAuto).filter(
    ([k]) => !k.startsWith("_")
  )
);

export function getEnhancementRestrictions(factionName, enhancementName) {
  if (!factionName || !enhancementName) return null;
  const factionEntry = ENHANCEMENT_RESTRICTIONS?.[factionName];
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
