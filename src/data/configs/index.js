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
 * Faction → enhancement-name → allowed host datasheet names. The source HTML
 * doesn't carry per-enhancement target restrictions, so this is a manual
 * curation layer applied during MFM parse (see `data-reader-11th.js`).
 *
 * Keys starting with "_" (e.g. "_comment") are ignored — used for inline doc
 * notes in the JSON file.
 */
export const ENHANCEMENT_RESTRICTIONS = enhancementRestrictions;

export function getEnhancementAllowedHosts(factionName, enhancementName) {
  if (!factionName || !enhancementName) return null;
  const factionEntry = ENHANCEMENT_RESTRICTIONS?.[factionName];
  if (!factionEntry || typeof factionEntry !== "object") return null;
  const list = factionEntry[enhancementName];
  return Array.isArray(list) && list.length > 0 ? list : null;
}
