import { CONFIGS, getEnhancementRestrictions } from "../data/configs";
import { normalizeString } from "./name-match";

const RESTRICTION_FIELDS = [
  "characterOnly",
  "nonCharacterOnly",
  "notOnEpicHeroes",
  "allowedHosts",
  "requiredKeywords",
  "limit",
  "autoTake",
];

function pickRestrictions(source) {
  const out = {};
  for (const key of RESTRICTION_FIELDS) {
    if (source?.[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/**
 * Parse one scraped faction JSON (as produced by `scripts/scrape-mfm-11th/`)
 * into the per-faction slice consumed by the runtime aggregator.
 *
 * Output shape:
 *   {
 *     faction: { name, detachments: [{ name, dp, enhancements }] },
 *     datasheets: [ ...units ],
 *     enhancementOptions: [ ...flattened enhancement entries ]
 *   }
 *
 * Role booleans (battleLine, character, epicHero, dedicatedTransport,
 * fortification) are layered on from `config.json`. Leader/Support
 * attaches-to relationships come straight from the scrape.
 */
export function parse11thFaction(factionJson) {
  const factionName = factionJson.faction;

  const datasheets = factionJson.datasheets.map((d) => {
    const sheet = {
      name: d.name,
      faction: factionName,
      ...(d.legends ? { legends: true } : {}),
      sizes: d.sizes.map((s) => {
        const size = {
          models: s.models,
          basePoints: s.tiers[0]?.points ?? 0,
          tiers: s.tiers,
        };
        // Drop the raw "1 model" / "10 models" name when it just restates
        // the `models` count — the DataSheet renderer already emits that
        // label from the count, so keeping the name doubles it up.
        // Preserve any custom names ("…with weapon X", etc.) untouched.
        if (s.name && !isPlainModelCountLabel(s.name, s.models)) {
          size.name = s.name;
        }
        return size;
      }),
    };

    if (d.leader) sheet.leader = d.leader;
    if (d.support) sheet.support = d.support;
    if (d.wargearOptions?.length) sheet.wargearOptions = d.wargearOptions;

    applyConfigRoleFlags(sheet);
    return sheet;
  });

  // Layer scraper-derived restrictions onto every enhancement once, so both
  // consumers (detachment.enhancements + the synthetic "Enhancements"
  // datasheet sizes) see the same enriched object. Source:
  // `configs/enhancement-restrictions.auto.json` plus the `nonCharacterOnly`
  // flag the scraper derives from the "(Upgrade)" suffix.
  const enrichedDetachments = factionJson.detachments.map((d) => ({
    ...d,
    enhancements: d.enhancements.map((enh) =>
      enrichEnhancement(enh, factionName)
    ),
  }));

  const enhancementOptions = [];
  for (const det of enrichedDetachments) {
    for (const enh of det.enhancements) {
      enhancementOptions.push({
        name: enh.name,
        detachment: det.name,
        enhancement: true,
        points: enh.points,
        basePoints: enh.points,
        tiers: [{ minCount: 1, points: enh.points }],
        ...pickRestrictions(enh),
      });
    }
  }

  return {
    faction: {
      name: factionName,
      detachments: enrichedDetachments.map((d) => ({
        name: d.name,
        dp: d.dp,
        role: d.role ?? null,
        leader: d.leader ?? null,
        tags: d.tags ?? [],
        // Keep the enhancement list on the detachment record so the codex
        // card can render them inline beneath the title (a detachment "looks
        // like a unit" with its enhancements as the option list).
        enhancements: d.enhancements,
      })),
    },
    datasheets,
    enhancementOptions,
  };
}

function enrichEnhancement(enh, factionName) {
  const override = getEnhancementRestrictions(factionName, enh.name);
  if (!override) return enh;
  return { ...enh, ...pickRestrictions(override) };
}

function isPlainModelCountLabel(name, models) {
  if (!name || models == null) return false;
  const m = name.trim().match(/^(\d+)\s+models?$/i);
  return !!m && Number(m[1]) === models;
}

function applyConfigRoleFlags(sheet) {
  const normalized = normalizeString(sheet.name);

  if (CONFIGS["epic-hero"].includes(normalized)) sheet.epicHero = true;
  if (CONFIGS["battle-line"].includes(normalized)) sheet.battleLine = true;
  if (CONFIGS["fortification"].includes(normalized)) sheet.fortification = true;
  if (CONFIGS["dedicated-transport"].includes(normalized)) {
    sheet.dedicatedTransport = true;
  }
  if (CONFIGS["character"].includes(normalized)) sheet.character = true;
}

/**
 * Build one MFM_VERSION bucket for an entire 11th-edition snapshot, given the
 * collection of faction JSONs in a version directory plus the snapshot's
 * manifest.
 *
 *   parse11thSnapshot({
 *     manifest: { siteVersion, scrapedAt },
 *     factions: { necrons: factionJson, "space-marines": factionJson, ... }
 *   })
 *   → { FACTIONS, DATA_SHEETS, MFM_VERSION }
 *
 * `MFM_VERSION` is the uppercased site version only (e.g. "V1.0"). The
 * scrape date stays on disk in `_manifest.json` for debugging but is never
 * exposed to the runtime — it isn't a meaningful version signal to users.
 */
export function parse11thSnapshot({ manifest, factions }) {
  const FACTIONS = [];
  const DATA_SHEETS = [
    { name: "Enhancements", enhancements: true, sizes: [] },
  ];
  const enhancementsSheet = DATA_SHEETS[0];

  for (const [slug, json] of Object.entries(factions)) {
    void slug;
    const { faction, datasheets, enhancementOptions } = parse11thFaction(json);
    FACTIONS.push(faction);
    DATA_SHEETS.push(...datasheets);
    enhancementsSheet.sizes.push(...enhancementOptions);
  }

  return {
    FACTIONS,
    DATA_SHEETS,
    MFM_VERSION: manifest.siteVersion.toUpperCase(),
  };
}
