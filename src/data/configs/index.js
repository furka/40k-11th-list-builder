import configs from "./config.json";
import enhancementRestrictions from "./enhancement-restrictions.json";
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
 * Faction → enhancement-name → per-enhancement restriction object. The source
 * HTML doesn't carry most per-enhancement restrictions, so this is a manual
 * curation layer applied during MFM parse (see `data-reader-11th.js`).
 *
 * Each entry may set any subset of:
 *   - characterOnly:    boolean — host must have `character: true`
 *   - nonCharacterOnly: boolean — host must NOT have `character: true`
 *   - notOnEpicHeroes:  boolean — host must NOT have `epicHero: true`
 *   - allowedHosts:     string[] — host datasheet name must be in this list
 *   - limit:            number — max copies of this enhancement in the army
 *   - autoTake:         string[] — reserved; future auto-attach behavior
 *
 * Keys starting with "_" (e.g. "_comment") are ignored — used for inline doc
 * notes in the JSON file.
 */
export const ENHANCEMENT_RESTRICTIONS = enhancementRestrictions;

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
