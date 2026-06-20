import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useArmyListStore } from "../stores/armyList";
import { useMfmStore } from "../stores/mfm";

const PRIMARY = "CHAOS KNIGHTS";
const ALLY = "CHAOS DAEMONS";
const OTHER_ALLY = "CHAOS SPACE MARINES";
const SHARED_A = "SPACE MARINES";
const SHARED_B = "BLOOD ANGELS";

const TEST_MFM = {
  EDITION: "11th",
  MFM_VERSION: "V1.0 (test)",
  FACTIONS: [
    { name: PRIMARY, detachments: [] },
    { name: ALLY, detachments: [] },
    { name: OTHER_ALLY, detachments: [] },
    { name: SHARED_A, detachments: [] },
    { name: SHARED_B, detachments: [] },
  ],
  DATA_SHEETS: [
    {
      name: "WAR DOG KARNIVORE",
      faction: PRIMARY,
      sizes: [
        { name: "1 model", models: 1, basePoints: 130, tiers: [{ minCount: 1, points: 130 }] },
      ],
    },
    {
      name: "BLOODLETTERS",
      faction: ALLY,
      sizes: [
        { name: "10 models", models: 10, basePoints: 110, tiers: [{ minCount: 1, points: 110 }] },
      ],
    },
    {
      name: "CHAOS LORD",
      faction: OTHER_ALLY,
      character: true,
      sizes: [
        { name: "1 model", models: 1, basePoints: 80, tiers: [{ minCount: 1, points: 80 }] },
      ],
    },
    // Same name across two factions — Intercessor-style.
    {
      name: "INTERCESSOR SQUAD",
      faction: SHARED_A,
      sizes: [
        { name: "5 models", models: 5, basePoints: 80, tiers: [{ minCount: 1, points: 80 }] },
      ],
    },
    {
      name: "INTERCESSOR SQUAD",
      faction: SHARED_B,
      sizes: [
        { name: "5 models", models: 5, basePoints: 80, tiers: [{ minCount: 1, points: 80 }] },
      ],
    },
  ],
};

function freshStore() {
  setActivePinia(createPinia());
  const mfm = useMfmStore();
  mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
  mfm.getVersion = (v) => (v === TEST_MFM.MFM_VERSION ? TEST_MFM : null);
  const list = useArmyListStore();
  list.setList({
    faction: PRIMARY,
    mfm_version: TEST_MFM.MFM_VERSION,
    maxPoints: 2000,
    units: [],
    detachments: [],
    allies: [],
  });
  return list;
}

describe("armyList.allies", () => {
  let store;
  beforeEach(() => {
    store = freshStore();
  });

  it("starts empty", () => {
    expect(store.allies).toEqual([]);
  });

  it("setAllies stores the array", () => {
    store.setAllies([ALLY, OTHER_ALLY]);
    expect(store.allies).toEqual([ALLY, OTHER_ALLY]);
  });

  it("setAllies coerces non-arrays to []", () => {
    store.setAllies(null);
    expect(store.allies).toEqual([]);
    store.setAllies(undefined);
    expect(store.allies).toEqual([]);
  });

  it("filters the primary faction out of the allies list", () => {
    store.setAllies([PRIMARY, ALLY]);
    expect(store.allies).toEqual([ALLY]);
  });

  it("does not remove allied units when their faction is un-allied", () => {
    store.setAllies([ALLY]);
    store.setUnits([
      { id: "kn", name: "WAR DOG KARNIVORE", models: 1 },
      { id: "bl", name: "BLOODLETTERS", models: 10, allied: true },
    ]);

    store.setAllies([]);

    expect(store.units.map((u) => u.id)).toEqual(["kn", "bl"]);
  });

  it("flags units from a removed ally faction as invalid", () => {
    store.setAllies([ALLY]);
    store.setUnits([
      {
        id: "bl",
        name: "BLOODLETTERS",
        models: 10,
        allied: true,
        alliedFaction: ALLY,
      },
    ]);
    store.setAllies([]);

    expect(store.getUnitValidationError({ id: "bl" })).toBe(
      `Must ally ${ALLY}`
    );
  });

  it("keeps allied units valid while their faction is still allied", () => {
    store.setAllies([ALLY]);
    store.setUnits([
      {
        id: "bl",
        name: "BLOODLETTERS",
        models: 10,
        allied: true,
        alliedFaction: ALLY,
      },
    ]);
    expect(store.getUnitValidationError({ id: "bl" })).toBe(false);
  });

  it("ties a multi-codex unit to its source faction (not any codex with the same name)", () => {
    // Added as a Blood Angels ally — un-allying Blood Angels but adding
    // Space Marines must still invalidate the unit, because the points and
    // datasheet are pinned to Blood Angels.
    store.setAllies([SHARED_A]);
    store.setUnits([
      {
        id: "ic",
        name: "INTERCESSOR SQUAD",
        models: 5,
        allied: true,
        alliedFaction: SHARED_B,
      },
    ]);
    expect(store.getUnitValidationError({ id: "ic" })).toBe(
      `Must ally ${SHARED_B}`
    );
  });

  it("legacy lists without alliedFaction fall back to a name-scan", () => {
    // A pre-alliedFaction saved list: only `allied: true`, no pinned source.
    // The store finds a non-primary faction with a matching datasheet and
    // uses that to gate validity, so older saves keep working.
    store.setAllies([]);
    store.setUnits([
      { id: "bl", name: "BLOODLETTERS", models: 10, allied: true },
    ]);
    expect(store.getUnitValidationError({ id: "bl" })).toBe(
      `Must ally ${ALLY}`
    );
  });

  it("does not flag primary-faction units even when they would otherwise look like ex-allies", () => {
    store.setAllies([]);
    store.setUnits([
      { id: "kn", name: "WAR DOG KARNIVORE", models: 1 },
    ]);
    expect(store.getUnitValidationError({ id: "kn" })).toBe(false);
  });

  it("toObject includes allies", () => {
    store.setAllies([ALLY]);
    const out = store.toObject();
    expect(out.allies).toEqual([ALLY]);
  });

  it("setList restores allies", () => {
    store.setList({
      faction: PRIMARY,
      mfm_version: TEST_MFM.MFM_VERSION,
      maxPoints: 2000,
      units: [],
      detachments: [],
      allies: [ALLY, OTHER_ALLY],
    });
    expect(store.allies).toEqual([ALLY, OTHER_ALLY]);
  });

  it("setList defaults missing allies to []", () => {
    store.setList({
      faction: PRIMARY,
      mfm_version: TEST_MFM.MFM_VERSION,
      maxPoints: 2000,
      units: [],
      detachments: [],
    });
    expect(store.allies).toEqual([]);
  });
});
