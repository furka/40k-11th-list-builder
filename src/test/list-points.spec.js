import { describe, it, expect } from "vitest";
import { computeListPoints, resolveTier } from "../utils/list-points";

// Synthetic MFM bucket modeling a small Necrons-shaped slice. Tier shape
// matches what the runtime parsers produce: every size has a `tiers` array,
// even flat-priced ones. 10th-edition normalized sizes look like
//   { tiers: [{ minCount: 1, points }] }
// 11th-edition tiered units look like
//   { tiers: [{ minCount: 1, maxCount: 2, points }, { minCount: 3, points }] }

const FACTION = "NECRONS";

const MFM = {
  EDITION: "11th",
  MFM_VERSION: "V1.0 (test)",
  FACTIONS: [
    {
      name: FACTION,
      detachments: [
        { name: "AWAKENED DYNASTY", dp: 3 },
        { name: "HAND OF THE DYNASTY", dp: 1 },
        { name: "SKYSHROUD SPEARHEAD", dp: 1 },
      ],
    },
  ],
  DATA_SHEETS: [
    { name: "Enhancements", enhancements: true, edition: "11th", sizes: [
      { name: "Veil of Darkness", basePoints: 25, tiers: [{ minCount: 1, points: 25 }] },
    ] },
    {
      name: "NECRON WARRIORS",
      faction: FACTION,
      edition: "11th",
      sizes: [
        { name: "10 models", models: 10, basePoints: 80, tiers: [{ minCount: 1, points: 80 }] },
        { name: "20 models", models: 20, basePoints: 190, tiers: [{ minCount: 1, points: 190 }] },
      ],
    },
    {
      name: "DOOMSDAY ARK",
      faction: FACTION,
      edition: "11th",
      sizes: [
        {
          name: "1 model",
          models: 1,
          basePoints: 200,
          tiers: [
            { minCount: 1, maxCount: 2, points: 200 },
            { minCount: 3, points: 220 },
          ],
        },
      ],
    },
    {
      name: "MONOLITH",
      faction: FACTION,
      edition: "11th",
      sizes: [
        {
          name: "1 model",
          models: 1,
          basePoints: 420,
          tiers: [
            { minCount: 1, maxCount: 1, points: 420 },
            { minCount: 2, points: 440 },
          ],
        },
      ],
    },
  ],
};

const unit = (overrides) => ({
  id: overrides.id ?? `u-${Math.random().toString(36).slice(2, 8)}`,
  ...overrides,
});

describe("resolveTier", () => {
  const dda = MFM.DATA_SHEETS.find((d) => d.name === "DOOMSDAY ARK").sizes[0];

  it("returns tier 1 for the 1st and 2nd copies", () => {
    expect(resolveTier(dda, 1).points).toBe(200);
    expect(resolveTier(dda, 2).points).toBe(200);
  });

  it("returns tier 2 for the 3rd+ copy", () => {
    expect(resolveTier(dda, 3).points).toBe(220);
    expect(resolveTier(dda, 7).points).toBe(220);
  });

  it("labels multi-tier copies but not single-tier copies", () => {
    expect(resolveTier(dda, 1).tierLabel).toBe("1st-2nd");
    expect(resolveTier(dda, 3).tierLabel).toBe("3rd+");
    const warriors = MFM.DATA_SHEETS.find(
      (d) => d.name === "NECRON WARRIORS"
    ).sizes[0];
    expect(resolveTier(warriors, 1).tierLabel).toBeNull();
  });

  it("returns -1 for an unknown size", () => {
    expect(resolveTier(null, 1).points).toBe(-1);
  });
});

describe("computeListPoints — flat units", () => {
  it("sums two copies of NECRON WARRIORS correctly", () => {
    const list = {
      edition: "11th",
      faction: FACTION,
      units: [
        unit({ id: "a", name: "NECRON WARRIORS", optionName: "10 models", models: 10 }),
        unit({ id: "b", name: "NECRON WARRIORS", optionName: "10 models", models: 10 }),
      ],
      detachments: [],
      maxDP: 3,
    };
    const out = computeListPoints(list, MFM, FACTION);
    expect(out.total).toBe(160);
    expect(out.perUnit.a.points).toBe(80);
    expect(out.perUnit.b.points).toBe(80);
  });
});

describe("computeListPoints — tiered units", () => {
  it("DOOMSDAY ARK: 2 copies cost tier-1 each, 3rd uses tier 2", () => {
    const list = {
      edition: "11th",
      faction: FACTION,
      units: [
        unit({ id: "a", name: "DOOMSDAY ARK", optionName: "1 model", models: 1 }),
        unit({ id: "b", name: "DOOMSDAY ARK", optionName: "1 model", models: 1 }),
        unit({ id: "c", name: "DOOMSDAY ARK", optionName: "1 model", models: 1 }),
      ],
      detachments: [],
      maxDP: 3,
    };
    const out = computeListPoints(list, MFM, FACTION);
    expect(out.total).toBe(620); // 200 + 200 + 220
    expect(out.perUnit.a.points).toBe(200);
    expect(out.perUnit.b.points).toBe(200);
    expect(out.perUnit.c.points).toBe(220);
    expect(out.perUnit.c.tierLabel).toBe("3rd+");
  });

  it("MONOLITH: 1st-only tier behaves correctly", () => {
    const list = {
      edition: "11th",
      faction: FACTION,
      units: [
        unit({ id: "a", name: "MONOLITH", optionName: "1 model", models: 1 }),
        unit({ id: "b", name: "MONOLITH", optionName: "1 model", models: 1 }),
        unit({ id: "c", name: "MONOLITH", optionName: "1 model", models: 1 }),
      ],
      detachments: [],
      maxDP: 3,
    };
    const out = computeListPoints(list, MFM, FACTION);
    expect(out.total).toBe(420 + 440 + 440);
    expect(out.perUnit.a.points).toBe(420);
    expect(out.perUnit.b.points).toBe(440);
    expect(out.perUnit.c.points).toBe(440);
  });

  it("removing the 2nd of 3 tiered copies shifts the survivor's tier", () => {
    // From [a, b, c] (200, 200, 220 — total 620) we remove b. The remaining
    // [a, c] should re-count as 1st and 2nd copies → 200, 200 (total 400).
    const before = {
      edition: "11th",
      faction: FACTION,
      units: [
        unit({ id: "a", name: "DOOMSDAY ARK", optionName: "1 model", models: 1 }),
        unit({ id: "b", name: "DOOMSDAY ARK", optionName: "1 model", models: 1 }),
        unit({ id: "c", name: "DOOMSDAY ARK", optionName: "1 model", models: 1 }),
      ],
      detachments: [],
      maxDP: 3,
    };
    expect(computeListPoints(before, MFM, FACTION).total).toBe(620);

    const after = { ...before, units: [before.units[0], before.units[2]] };
    const out = computeListPoints(after, MFM, FACTION);
    expect(out.total).toBe(400);
    expect(out.perUnit.a.points).toBe(200);
    expect(out.perUnit.c.points).toBe(200);
  });

  it("reordering tiered copies does not change the total", () => {
    const a = unit({ id: "a", name: "DOOMSDAY ARK", optionName: "1 model", models: 1 });
    const b = unit({ id: "b", name: "DOOMSDAY ARK", optionName: "1 model", models: 1 });
    const c = unit({ id: "c", name: "DOOMSDAY ARK", optionName: "1 model", models: 1 });
    const base = { edition: "11th", faction: FACTION, units: [a, b, c], detachments: [], maxDP: 3 };
    const reordered = { ...base, units: [c, a, b] };
    expect(computeListPoints(base, MFM, FACTION).total).toBe(620);
    expect(computeListPoints(reordered, MFM, FACTION).total).toBe(620);
  });
});

describe("computeListPoints — enhancements and bonus options", () => {
  it("does not count enhancements toward the per-datasheet tier counter", () => {
    const list = {
      edition: "11th",
      faction: FACTION,
      units: [
        unit({ id: "e", name: "Enhancements", optionName: "Veil of Darkness" }),
        unit({ id: "a", name: "DOOMSDAY ARK", optionName: "1 model", models: 1 }),
        unit({ id: "b", name: "DOOMSDAY ARK", optionName: "1 model", models: 1 }),
        unit({ id: "c", name: "DOOMSDAY ARK", optionName: "1 model", models: 1 }),
      ],
      detachments: [],
      maxDP: 3,
    };
    const out = computeListPoints(list, MFM, FACTION);
    // Same 200+200+220 = 620 for DDAs + 25 for the enhancement.
    expect(out.total).toBe(645);
    expect(out.perUnit.e.points).toBe(25);
    expect(out.perUnit.c.points).toBe(220);
  });
});

describe("computeListPoints — DP", () => {
  it("sums DP across selected 11th-edition detachments", () => {
    const list = {
      edition: "11th",
      faction: FACTION,
      units: [],
      detachments: ["HAND OF THE DYNASTY", "SKYSHROUD SPEARHEAD"],
      maxDP: 3,
    };
    const { dp } = computeListPoints(list, MFM, FACTION);
    expect(dp).toEqual({
      used: 2,
      max: 3,
      byDetachment: [
        { name: "HAND OF THE DYNASTY", dp: 1 },
        { name: "SKYSHROUD SPEARHEAD", dp: 1 },
      ],
    });
  });

});
