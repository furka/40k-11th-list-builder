import configs from "./config.json";
import enhancementRestrictionsAuto from "./enhancement-restrictions.auto.json";
import { normalizeString } from "../../utils/name-match";

// Faction-keyed role classifications, flattened into normalized name arrays
// the parser consults at load time. The source HTML doesn't expose these
// per-unit, so they're curated manually. Legends classification used to live
// here too; it's now scraped (see `scrape-mfm-11th/index.mjs`).
export const CONFIGS = {
  "battle-line": [],
  "dedicated-transport": [],
  "epic-hero": [],
  character: [],
  fortification: [],
};

for (const key in configs) {
  const config = configs[key];

  for (const role of [
    "battle-line",
    "character",
    "epic-hero",
    "dedicated-transport",
    "fortification",
  ]) {
    if (config[role]) {
      CONFIGS[role].push(...config[role].map((i) => normalizeString(i)));
    }
  }
}

/**
 * Faction → enhancement-name → per-enhancement restriction object, scraped
 * from the official Faction Pack PDFs by `scripts/scrape-mfm-11th/`. The
 * scraper is the single source of truth — if an entry here is wrong, fix the
 * scraper and re-run it, don't patch the JSON.
 *
 * Each entry may set any subset of:
 *   - characterOnly:    boolean — host must have `character: true`
 *   - nonCharacterOnly: boolean — host must NOT have `character: true`
 *   - notOnEpicHeroes:  boolean — host must NOT have `epicHero: true`
 *   - allowedHosts:     string[] — host datasheet name must be in this list
 *   - requiredKeywords: string[] — captured from the PDF's host phrase but not
 *                       yet enforced (datasheet keyword tracking is a future
 *                       scope). When present, the validator suppresses the
 *                       allowedHosts check too: the captured rule was a
 *                       disjunction ("Captain OR Adeptus Astartes Terminator
 *                       model only") and we'd rather under-enforce than
 *                       wrongly block by checking only half. Will activate
 *                       when datasheet keyword tracking is added.
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
