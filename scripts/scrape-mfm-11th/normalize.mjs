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
 *         ]
 *       }
 *     ]
 *   }
 *
 * The role booleans (battleLine, character, epicHero, dedicatedTransport,
 * fortification) are not produced here — they are layered on by the runtime
 * parser via `config.json` lookup, mirroring the 10th-edition flow.
 */
export function normalizeFactionData(factionSlug, factionName, raw) {
  return {
    faction: factionName,
    siteVersion: raw.siteVersion,
    detachments: raw.detachments.map((d) => ({
      name: d.name,
      dp: d.dp,
      tags: d.tags ?? [],
      enhancements: d.enhancements,
    })),
    datasheets: raw.datasheets.map((d) => ({
      name: d.name,
      leader: d.leader,
      support: d.support,
      sizes: normalizeSizes(d.tiers),
    })),
  };
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
