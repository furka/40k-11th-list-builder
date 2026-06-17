import { battleSizeRules } from "./battle-size";

/**
 * Tier-aware points engine. Single source of truth for list totals.
 *
 * Walks `list.units` in order, counts datasheet occurrences as it goes, and
 * resolves the correct tier per copy. Returns:
 *
 *   {
 *     total: number,
 *     perUnit: { [unit.id]: { points, tierIndex, tierLabel } },
 *     dp: { used, max, byDetachment: [{ name, dp }] }
 *   }
 *
 * - Enhancements and `bonus: true` options are flat-priced and don't bump the
 *   per-datasheet copy counter.
 */
export function computeListPoints(list, mfm, faction) {
  const perUnit = {};
  let total = 0;

  if (!mfm || !mfm.DATA_SHEETS) {
    return { total: 0, perUnit, dp: { used: 0, max: 0, byDetachment: [] } };
  }

  const counters = {};
  const datasheetCache = {};

  const getDatasheet = (unit) => {
    const cacheKey = `${unit.name}::${faction ?? ""}`;
    if (cacheKey in datasheetCache) return datasheetCache[cacheKey];

    let sheet = null;
    const isEnhancement = !unit.models && unit.optionName;
    if (isEnhancement) {
      sheet = mfm.DATA_SHEETS.find((d) => d.name === "Enhancements") ?? null;
    } else {
      if (faction) {
        sheet =
          mfm.DATA_SHEETS.find(
            (d) => d.name === unit.name && d.faction === faction
          ) ?? null;
      }
      if (!sheet) {
        sheet = mfm.DATA_SHEETS.find((d) => d.name === unit.name) ?? null;
      }
    }
    datasheetCache[cacheKey] = sheet;
    return sheet;
  };

  for (const unit of list.units ?? []) {
    const sheet = getDatasheet(unit);
    const size = findSize(sheet, unit);

    const isEnhancement = !unit.models && unit.optionName;
    const isBonus = !!unit.bonus;

    if (isEnhancement || isBonus) {
      const points = size?.basePoints ?? size?.points ?? -1;
      perUnit[unit.id] = { points, tierIndex: 0, tierLabel: null };
      if (points > 0) total += points;
      continue;
    }

    counters[unit.name] = (counters[unit.name] || 0) + 1;
    const copyIndex = counters[unit.name];
    const tierResult = resolveTier(size, copyIndex);
    perUnit[unit.id] = tierResult;
    if (tierResult.points > 0) total += tierResult.points;
  }

  const dp = computeDP(list, mfm, faction);

  return { total, perUnit, dp };
}

/**
 * Lookup the size entry for a unit on a datasheet, mirroring the matching
 * rules in `getPoints`: prefer `optionName`, fall back to `models`.
 */
function findSize(sheet, unit) {
  if (!sheet) return null;
  if (unit.optionName) {
    const opt = sheet.sizes.find((s) => s.name === unit.optionName.trim());
    if (opt) return opt;
  }
  if (unit.models) {
    return sheet.sizes.find((s) => s.models === unit.models) ?? null;
  }
  return null;
}

/**
 * Pick the correct tier for the given copy index.
 *
 * Returns:
 *   { points, tierIndex, tierLabel }
 *
 * `tierLabel` is null for single-tier units (e.g. "10 models 80 pts"). For
 * multi-tier units it's a human-readable hint like "1st", "1st-2nd", "3rd+".
 */
export function resolveTier(size, copyIndex) {
  if (!size) return { points: -1, tierIndex: 0, tierLabel: null };

  const tiers = size.tiers ?? [
    { minCount: 1, points: size.basePoints ?? size.points },
  ];

  let chosen = tiers[0];
  let chosenIdx = 0;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const minOk = copyIndex >= t.minCount;
    const maxOk = t.maxCount === undefined || copyIndex <= t.maxCount;
    if (minOk && maxOk) {
      chosen = t;
      chosenIdx = i;
    }
  }

  return {
    points: chosen.points,
    tierIndex: chosenIdx,
    tierLabel: tiers.length > 1 ? tierLabel(chosen) : null,
  };
}

function tierLabel(tier) {
  const minOrd = ordinal(tier.minCount);
  if (tier.maxCount === undefined) return `${minOrd}+`;
  if (tier.maxCount === tier.minCount) return minOrd;
  return `${minOrd}-${ordinal(tier.maxCount)}`;
}

function ordinal(n) {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}

function computeDP(list, mfm, faction) {
  const factionEntry = mfm.FACTIONS?.find((f) => f.name === faction);
  const byDetachment = (list.detachments ?? []).map((name) => {
    const meta = factionEntry?.detachments.find((d) => d.name === name);
    return { name, dp: meta?.dp ?? 0 };
  });

  const used = byDetachment.reduce((sum, d) => sum + d.dp, 0);
  // DP budget is purely derived from the battle size (1000 pt → 2, 2000 pt
  // → 3). Changing maxPoints in the toolbar automatically re-budgets.
  const rules = battleSizeRules(list);
  const max = rules?.maxDP ?? 0;
  return { used, max, byDetachment };
}

/**
 * Look up the metadata for a single detachment in a faction. Returned shape
 * is whatever the parser produced (typically `{ name, dp, tags }`).
 */
export function findDetachment(mfm, faction, detachmentName) {
  if (!mfm || !detachmentName) return null;
  const factionEntry = mfm.FACTIONS?.find((f) => f.name === faction);
  return (
    factionEntry?.detachments.find((d) => d.name === detachmentName) ?? null
  );
}
