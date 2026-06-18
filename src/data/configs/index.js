import configs from "./config.json";
import enhancementRestrictionsAuto from "./enhancement-restrictions.auto.json";
import enhancementRestrictionsManual from "./enhancement-restrictions.json";
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
 * Faction → enhancement-name → per-enhancement restriction object.
 *
 * Two layers, merged with the manual layer winning per enhancement key:
 *   1. `enhancement-restrictions.auto.json` — written by the scrape pipeline
 *      from the official Faction Pack PDFs (see scripts/scrape-mfm-11th).
 *   2. `enhancement-restrictions.json` — hand-curated overrides; entries here
 *      replace the auto layer wholesale for the named enhancement.
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
function mergeEnhancementRestrictions(auto, manual) {
  const out = {};
  for (const faction of new Set([
    ...Object.keys(auto ?? {}),
    ...Object.keys(manual ?? {}),
  ])) {
    if (faction.startsWith("_")) continue;
    const a = auto?.[faction];
    const m = manual?.[faction];
    if (typeof a !== "object" && typeof m !== "object") continue;
    const merged = {};
    for (const enhName of new Set([
      ...Object.keys(a ?? {}),
      ...Object.keys(m ?? {}),
    ])) {
      if (enhName.startsWith("_")) continue;
      // Manual overrides win wholesale (not deep-merged) — when a curator
      // intervenes for a specific enhancement they replace the scraped record.
      merged[enhName] = m?.[enhName] ?? a?.[enhName];
    }
    out[faction] = merged;
  }
  return out;
}

export const ENHANCEMENT_RESTRICTIONS = mergeEnhancementRestrictions(
  enhancementRestrictionsAuto,
  enhancementRestrictionsManual
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
