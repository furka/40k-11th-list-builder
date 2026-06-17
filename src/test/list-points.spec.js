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
    {
      name: "FIELD ORDNANCE BATTERY",
      faction: FACTION,
      edition: "11th",
      sizes: [
        { name: "2 models", models: 2, basePoints: 90, tiers: [{ minCount: 1, points: 90 }] },
      ],
      wargearOptions: [
        { name: "Bombast field gun", points: 10 },
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

describe("computeListPoints — wargear", () => {
  const host = (id) =>
    unit({
      id,
      name: "FIELD ORDNANCE BATTERY",
      optionName: "2 models",
      models: 2,
    });
  const wgr = (id, attachedTo, optionName = "Bombast field gun") => ({
    id,
    name: "Wargear",
    parentDataSheet: "FIELD ORDNANCE BATTERY",
    optionName,
    attachedTo,
  });

  it("looks up wargear points from the host's datasheet wargearOptions", () => {
    const list = {
      edition: "11th",
      faction: FACTION,
      units: [host("h"), wgr("w", "h")],
      detachments: [],
      maxDP: 3,
    };
    const out = computeListPoints(list, MFM, FACTION);
    expect(out.total).toBe(100); // 90 (host) + 10 (wargear)
    expect(out.perUnit.w.points).toBe(10);
  });

  it("sums multiple wargear rows on the same host", () => {
    const list = {
      edition: "11th",
      faction: FACTION,
      units: [host("h"), wgr("w1", "h"), wgr("w2", "h"), wgr("w3", "h")],
      detachments: [],
      maxDP: 3,
    };
    const out = computeListPoints(list, MFM, FACTION);
    expect(out.total).toBe(120); // 90 + 3*10
  });

  it("does NOT increment the per-datasheet tier counter", () => {
    // Three DOOMSDAY ARKs should still slip into tier-2 at the 3rd copy,
    // even when wargear sits between them in the array.
    const dda = (id) =>
      unit({ id, name: "DOOMSDAY ARK", optionName: "1 model", models: 1 });
    const wgr_dda = (id, attachedTo) => ({
      id,
      name: "Wargear",
      parentDataSheet: "DOOMSDAY ARK",
      optionName: "fake gun",
      attachedTo,
    });
    const list = {
      edition: "11th",
      faction: FACTION,
      units: [
        dda("a"),
        wgr_dda("wa", "a"),
        dda("b"),
        wgr_dda("wb", "b"),
        dda("c"),
      ],
      detachments: [],
      maxDP: 3,
    };
    const out = computeListPoints(list, MFM, FACTION);
    expect(out.perUnit.a.points).toBe(200);
    expect(out.perUnit.b.points).toBe(200);
    expect(out.perUnit.c.points).toBe(220);
    // The "fake gun" option doesn't exist on DOOMSDAY ARK in the synthetic
    // MFM, so wargear rows price -1 (excluded from total).
    expect(out.perUnit.wa.points).toBe(-1);
    expect(out.perUnit.wb.points).toBe(-1);
    expect(out.total).toBe(620);
  });

  it("returns -1 (and excludes from total) when the host is missing", () => {
    const list = {
      edition: "11th",
      faction: FACTION,
      units: [wgr("orphan", "ghost-host")],
      detachments: [],
      maxDP: 3,
    };
    const out = computeListPoints(list, MFM, FACTION);
    expect(out.perUnit.orphan.points).toBe(-1);
    expect(out.total).toBe(0);
  });

  it("returns -1 when the host's datasheet no longer carries that wargear option", () => {
    const list = {
      edition: "11th",
      faction: FACTION,
      units: [host("h"), wgr("w", "h", "Retired Gun")],
      detachments: [],
      maxDP: 3,
    };
    const out = computeListPoints(list, MFM, FACTION);
    expect(out.perUnit.w.points).toBe(-1);
    expect(out.total).toBe(90);
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
        { name: "HAND OF THE DYNASTY", dp: 1, role: null, leader: null },
        { name: "SKYSHROUD SPEARHEAD", dp: 1, role: null, leader: null },
      ],
    });
  });

  it("threads role + leader from the MFM lookup into byDetachment", () => {
    const ROLE = { name: "TAKE AND HOLD", color: "#2E6B3E" };
    const LEADER = { attachesTo: ["LOKHUST DESTROYERS"] };
    const mfmWithExtras = {
      ...MFM,
      FACTIONS: [
        {
          name: FACTION,
          detachments: [
            { name: "AWAKENED DYNASTY", dp: 3, role: ROLE, leader: null },
            { name: "CURSED LEGION", dp: 2, role: null, leader: LEADER },
          ],
        },
      ],
    };
    const list = {
      edition: "11th",
      faction: FACTION,
      units: [],
      detachments: ["AWAKENED DYNASTY", "CURSED LEGION"],
      maxDP: 5,
    };
    const { dp } = computeListPoints(list, mfmWithExtras, FACTION);
    expect(dp.byDetachment).toEqual([
      { name: "AWAKENED DYNASTY", dp: 3, role: ROLE, leader: null },
      { name: "CURSED LEGION", dp: 2, role: null, leader: LEADER },
    ]);
  });
});
