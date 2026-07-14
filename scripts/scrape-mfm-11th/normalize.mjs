import { normalizeApostrophesDeep } from "../../src/utils/apostrophe-normalization.js";

/**
 * Normalize intermediate extracted JSON into the shape the runtime parser
 * (`src/utils/data-reader-11th.js`) expects to consume.
 *
 * Output shape per faction:
 *   {
 *     faction: "NECRONS",
 *     siteVersion: "v1.0",
 *     detachments: [
 *       { name, dp, tags: [...], enhancements: [{ name, points }] }
 *     ],
 *     datasheets: [
 *       {
 *         name,
 *         leader: { attachesTo: [...] } | null,
 *         support: { attachesTo: [...] } | null,
 *         sizes: [
 *           {
 *             name: "10 models",
 *             models: 10,
 *             tiers: [{ minCount, maxCount?, points }]
 *           }
 *         ],
 *         wargearOptions?: [{ name: "per Bombast field gun", points: 10 }]
 *       }
 *     ]
 *   }
 *
 * `wargearOptions` is optional and absent for datasheets without a WARGEAR
 * OPTIONS section in the MFM. When present, each entry is a free-form
 * upgrade row (no models / tiers — flat per-occurrence cost).
 *
 * Per-datasheet `keywords` (BATTLELINE, CHARACTER, INFANTRY, FLY, etc.) are
 * not produced here — they're attached by the runtime parser via the
 * keyword overlay at `src/data/keywords/` (BSData-sourced + manual
 * overrides).
 */
export function normalizeFactionData(factionSlug, factionName, raw) {
  // Canonicalize apostrophe-like unicode codepoints across every string in
  // the payload so byte-exact comparisons downstream (allowedHosts, the
  // attachment validator's `host.name === entry` checks) don't drift on
  // typographic variants. See src/utils/apostrophe-normalization.js.
  return normalizeApostrophesDeep({
    faction: factionName,
    siteVersion: raw.siteVersion,
    detachments: raw.detachments.map((d) => ({
      name: d.name,
      dp: d.dp,
      role: d.role ?? null,
      leader: d.leader ?? null,
      tags: d.tags ?? [],
      enhancements: d.enhancements,
    })),
    datasheets: normalizeDatasheets(raw.datasheets),
  });
}

// Imperial Agents units are scraped twice (see extract.mjs): a base record and
// an `allied: true` twin carrying the "Agents of the Imperium" allied cost. Emit
// ONE datasheet per unit — the base sizes/tiers — and fold the allied twin's
// per-tier cost in as `alliedPoints`, so the runtime can pick the right price by
// whether the unit is fielded as an ally. Non-Imperial-Agents factions have no
// allied twins, so this collapses to a plain 1:1 map.
function normalizeDatasheets(rawDatasheets) {
  const datasheets = [];
  const byName = new Map();
  for (const d of rawDatasheets) {
    if (d.allied) continue;
    const sheet = {
      name: d.name,
      leader: d.leader,
      support: d.support,
      sizes: normalizeSizes(d.tiers),
    };
    if (d.wargearOptions?.length) sheet.wargearOptions = d.wargearOptions;
    datasheets.push(sheet);
    byName.set(d.name, sheet);
  }

  for (const d of rawDatasheets) {
    if (!d.allied) continue;
    const base = byName.get(d.name);
    if (base) {
      mergeAlliedPoints(base.sizes, normalizeSizes(d.tiers));
      continue;
    }
    // No base twin (shouldn't happen for the two-run Imperial Agents layout, but
    // never drop a datasheet): emit it as a plain base sheet.
    const sheet = {
      name: d.name,
      leader: d.leader,
      support: d.support,
      sizes: normalizeSizes(d.tiers),
    };
    if (d.wargearOptions?.length) sheet.wargearOptions = d.wargearOptions;
    datasheets.push(sheet);
    byName.set(d.name, sheet);
  }

  return datasheets;
}

// Fold allied-twin per-tier points onto the matching base tiers as
// `alliedPoints`. Sizes and tiers line up because both runs come from the same
// MFM layout; anything that doesn't match is simply left without an allied price
// (the runtime falls back to the base cost).
function mergeAlliedPoints(baseSizes, alliedSizes) {
  const sizeKey = (s) => `${s.name ?? ""}::${s.models ?? "?"}`;
  const tierKey = (t) => `${t.minCount}::${t.maxCount ?? "*"}`;
  const alliedBySize = new Map(alliedSizes.map((s) => [sizeKey(s), s]));
  for (const size of baseSizes) {
    const allied = alliedBySize.get(sizeKey(size));
    if (!allied) continue;
    const alliedTiers = new Map(allied.tiers.map((t) => [tierKey(t), t]));
    for (const tier of size.tiers) {
      const at = alliedTiers.get(tierKey(tier));
      if (at && at.points != null) tier.alliedPoints = at.points;
    }
  }
}

function normalizeSizes(tiers) {
  // The MFM groups options BY tier first (e.g. "YOUR 1ST UNIT COSTS" has
  // size-options like "10 models, 20 models"). Our runtime engine consumes
  // them grouped BY size: each unique size (by `models` count and label) gets
  // one entry whose `tiers` array carries the per-tier points.
  //
  // Pivot tier-major → size-major:
  const byKey = new Map();

  for (const tier of tiers) {
    for (const option of tier.options) {
      const key = `${option.name}::${option.models ?? "?"}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          name: option.name,
          models: option.models,
          tiers: [],
        });
      }
      const size = byKey.get(key);
      const tierEntry = { minCount: tier.minCount, points: option.points };
      if (tier.maxCount !== undefined) tierEntry.maxCount = tier.maxCount;
      size.tiers.push(tierEntry);
    }
  }

  for (const size of byKey.values()) {
    size.tiers.sort((a, b) => a.minCount - b.minCount);
  }

  return [...byKey.values()];
}
