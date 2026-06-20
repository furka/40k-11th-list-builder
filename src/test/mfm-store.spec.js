import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useMfmStore } from "../stores/mfm";

// A second synthetic MFM lets us exercise getUnitPointsDifference and changes()
// against a clearly-different "previous" snapshot without depending on what
// real game data happens to ship in the repo.
const MFM_V1 = {
  MFM_VERSION: "V1.0 (a)",
  DATA_SHEETS: [
    {
      name: "Warriors",
      faction: "NECRONS",
      sizes: [
        { name: "10 models", models: 10, basePoints: 100 },
        { name: "20 models", models: 20, basePoints: 200 },
      ],
      wargearOptions: [{ name: "Gauss Reaper", points: 5 }],
    },
    {
      name: "Warriors",
      faction: "OTHER",
      sizes: [{ name: "10 models", models: 10, basePoints: 999 }],
    },
    {
      name: "Enhancements",
      sizes: [
        { name: "Veil of Darkness", points: 25 },
        { name: "Arisen Tyrant", points: 30 },
      ],
    },
    {
      name: "TieredUnit",
      faction: "NECRONS",
      sizes: [
        {
          name: "1 model",
          models: 1,
          basePoints: 100,
          tiers: [
            { minCount: 1, points: 100 },
            { minCount: 2, points: 90 },
          ],
        },
      ],
    },
  ],
};

const MFM_V2 = {
  MFM_VERSION: "V1.1 (b)",
  DATA_SHEETS: [
    {
      name: "Warriors",
      faction: "NECRONS",
      sizes: [
        { name: "10 models", models: 10, basePoints: 110 }, // +10
        { name: "20 models", models: 20, basePoints: 220 }, // +20
      ],
    },
  ],
};

function freshMfm() {
  setActivePinia(createPinia());
  return useMfmStore();
}

describe("normalizeMfmVersion (exposed on the store)", () => {
  let mfm;
  beforeEach(() => {
    mfm = freshMfm();
  });

  it("returns falsy input unchanged (null/undefined/empty)", () => {
    expect(mfm.normalizeMfmVersion(null)).toBe(null);
    expect(mfm.normalizeMfmVersion(undefined)).toBe(undefined);
    expect(mfm.normalizeMfmVersion("")).toBe("");
  });

  it("strips a trailing ' (YYYY-MM-DD)' suffix", () => {
    expect(mfm.normalizeMfmVersion("V1.0 (2026-06-17)")).toBe("V1.0");
  });

  it("leaves versions without a date suffix unchanged", () => {
    expect(mfm.normalizeMfmVersion("V1.0")).toBe("V1.0");
    expect(mfm.normalizeMfmVersion("V2.3")).toBe("V2.3");
  });
});

describe("getVersion (against the real loaded MFM)", () => {
  let mfm;
  beforeEach(() => {
    mfm = freshMfm();
  });

  it("returns null for falsy input", () => {
    expect(mfm.getVersion(null)).toBe(null);
    expect(mfm.getVersion(undefined)).toBe(null);
    expect(mfm.getVersion("")).toBe(null);
  });

  it("returns null for the special CURRENT/PREVIOUS keys (not real versions)", () => {
    expect(mfm.getVersion("CURRENT")).toBe(null);
    expect(mfm.getVersion("PREVIOUS")).toBe(null);
  });

  it("returns null for an unknown version", () => {
    expect(mfm.getVersion("V999.0")).toBe(null);
  });

  it("resolves the current snapshot from its version key", () => {
    // Read the actual current version dynamically so the test stays robust
    // against future MFM updates.
    const currentKey = mfm.MFM.CURRENT.MFM_VERSION;
    expect(mfm.getVersion(currentKey)).toBe(mfm.MFM.CURRENT);
  });

  it("resolves a version key that still carries the legacy ' (YYYY-MM-DD)' suffix", () => {
    const currentKey = mfm.MFM.CURRENT.MFM_VERSION;
    expect(mfm.getVersion(`${currentKey} (2026-06-17)`)).toBe(mfm.MFM.CURRENT);
  });
});

describe("getPoints", () => {
  let mfm;
  beforeEach(() => {
    mfm = freshMfm();
  });

  it("returns -1 when the MFM has no DATA_SHEETS", () => {
    expect(mfm.getPoints({ name: "Warriors" }, {})).toBe(-1);
  });

  it("matches a regular unit by optionName", () => {
    expect(
      mfm.getPoints({ name: "Warriors", optionName: "20 models" }, MFM_V1)
    ).toBe(200);
  });

  it("matches a regular unit by models when no optionName is given", () => {
    expect(mfm.getPoints({ name: "Warriors", models: 10 }, MFM_V1)).toBe(100);
  });

  it("returns -1 when no size matches the given optionName", () => {
    expect(
      mfm.getPoints({ name: "Warriors", optionName: "999 models" }, MFM_V1)
    ).toBe(-1);
  });

  it("falls back to the first datasheet when no faction is passed", () => {
    // Two Warriors entries exist (NECRONS:100 and OTHER:999). With no faction,
    // the lookup takes whichever comes first in DATA_SHEETS — NECRONS here.
    expect(mfm.getPoints({ name: "Warriors", models: 10 }, MFM_V1)).toBe(100);
  });

  it("filters by faction when one is provided", () => {
    expect(
      mfm.getPoints({ name: "Warriors", models: 10 }, MFM_V1, "OTHER")
    ).toBe(999);
  });

  it("falls back to a faction-less match if the faction-specific one is missing", () => {
    // Asking for a faction the datasheet doesn't have → the second find()
    // strips the faction filter and returns the first matching name.
    expect(
      mfm.getPoints({ name: "Warriors", models: 10 }, MFM_V1, "UNKNOWN")
    ).toBe(100);
  });

  it("returns -1 when the unit's datasheet doesn't exist at all", () => {
    expect(mfm.getPoints({ name: "Ghost", models: 1 }, MFM_V1)).toBe(-1);
  });

  it("resolves Enhancements via the 'Enhancements' datasheet, not the faction filter", () => {
    expect(
      mfm.getPoints({ name: "Enhancements", optionName: "Veil of Darkness" }, MFM_V1)
    ).toBe(25);
    expect(
      mfm.getPoints(
        { name: "Enhancements", optionName: "Arisen Tyrant" },
        MFM_V1,
        "ignored-faction"
      )
    ).toBe(30);
  });

  it("uses the ctx.copyIndex tier when ctx is provided", () => {
    // Tier table: minCount 1 → 100, minCount 2 → 90. resolveTier picks the
    // highest tier whose minCount the copyIndex satisfies.
    expect(
      mfm.getPoints(
        { name: "TieredUnit", optionName: "1 model" },
        MFM_V1,
        null,
        { copyIndex: 1 }
      )
    ).toBe(100);
    expect(
      mfm.getPoints(
        { name: "TieredUnit", optionName: "1 model" },
        MFM_V1,
        null,
        { copyIndex: 2 }
      )
    ).toBe(90);
  });
});

describe("getPoints — Wargear branch", () => {
  let mfm;
  beforeEach(() => {
    mfm = freshMfm();
  });

  it("returns -1 when parentDataSheet is missing", () => {
    expect(
      mfm.getPoints(
        { name: "Wargear", optionName: "Gauss Reaper" },
        MFM_V1
      )
    ).toBe(-1);
  });

  it("returns -1 when optionName is missing", () => {
    expect(
      mfm.getPoints(
        { name: "Wargear", parentDataSheet: "Warriors" },
        MFM_V1
      )
    ).toBe(-1);
  });

  it("returns the wargearOption price for a valid (host, option) pair", () => {
    expect(
      mfm.getPoints(
        {
          name: "Wargear",
          parentDataSheet: "Warriors",
          optionName: "Gauss Reaper",
        },
        MFM_V1
      )
    ).toBe(5);
  });

  it("returns -1 when the option name isn't on the host's wargearOptions", () => {
    expect(
      mfm.getPoints(
        {
          name: "Wargear",
          parentDataSheet: "Warriors",
          optionName: "Retired Option",
        },
        MFM_V1
      )
    ).toBe(-1);
  });

  it("filters by faction first, then falls back when the faction-specific host is missing", () => {
    // Warriors:OTHER has NO wargearOptions; with faction='OTHER' the first
    // find() returns that host (no Gauss Reaper) → -1. Without faction, it
    // hits Warriors:NECRONS first → 5.
    expect(
      mfm.getPoints(
        {
          name: "Wargear",
          parentDataSheet: "Warriors",
          optionName: "Gauss Reaper",
        },
        MFM_V1,
        "OTHER"
      )
    ).toBe(-1);
    expect(
      mfm.getPoints(
        {
          name: "Wargear",
          parentDataSheet: "Warriors",
          optionName: "Gauss Reaper",
        },
        MFM_V1,
        "UNKNOWN" // not in MFM at all → falls back to faction-less lookup → NECRONS
      )
    ).toBe(5);
  });
});

describe("getUnitPointsDifference", () => {
  let mfm;
  beforeEach(() => {
    mfm = freshMfm();
  });

  it("returns the signed delta between two MFMs", () => {
    const unit = { name: "Warriors", optionName: "10 models" };
    expect(mfm.getUnitPointsDifference(unit, MFM_V2, MFM_V1)).toBe(10);
    expect(mfm.getUnitPointsDifference(unit, MFM_V1, MFM_V2)).toBe(-10);
  });

  it("returns 0 when either side resolves to -1 (missing/unknown)", () => {
    const ghost = { name: "Ghost", models: 1 };
    expect(mfm.getUnitPointsDifference(ghost, MFM_V1, MFM_V2)).toBe(0);
  });
});
