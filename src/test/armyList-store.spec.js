import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useArmyListStore } from "../stores/armyList";
import { useMfmStore } from "../stores/mfm";

const FACTION = "NECRONS";

// Minimal synthetic MFM with one bodyguard + one leader + one support, so the
// store can resolve datasheets when running validation.
const TEST_MFM = {
  EDITION: "11th",
  MFM_VERSION: "V1.0 (test)",
  FACTIONS: [
    {
      name: FACTION,
      detachments: [
        {
          name: "AWAKENED DYNASTY",
          dp: 3,
          role: null,
          leader: null,
          tags: [],
          enhancements: [
            { name: "Veil of Darkness", points: 25 },
            { name: "Arisen Tyrant", points: 30 },
            { name: "Enlivened Sentinels", points: 20, isUnitUpgrade: true },
            {
              name: "Special Upgrade",
              points: 5,
              isUnitUpgrade: true,
              allowedHosts: ["NECRON WARRIORS"],
            },
          ],
        },
      ],
    },
  ],
  DATA_SHEETS: [
    {
      name: "NECRON WARRIORS",
      faction: FACTION,
      edition: "11th",
      battleLine: true,
      sizes: [
        { name: "10 models", models: 10, basePoints: 80, tiers: [{ minCount: 1, points: 80 }] },
      ],
    },
    {
      name: "IMOTEKH THE STORMLORD",
      faction: FACTION,
      edition: "11th",
      character: true,
      leader: { attachesTo: ["NECRON WARRIORS"] },
      sizes: [
        { name: "1 model", models: 1, basePoints: 100, tiers: [{ minCount: 1, points: 100 }] },
      ],
    },
    {
      name: "CHRONOMANCER",
      faction: FACTION,
      edition: "11th",
      character: true,
      support: { attachesTo: ["NECRON WARRIORS"] },
      sizes: [
        { name: "1 model", models: 1, basePoints: 80, tiers: [{ minCount: 1, points: 80 }] },
      ],
    },
    {
      name: "DOOMSDAY ARK",
      faction: FACTION,
      edition: "11th",
      sizes: [
        { name: "1 model", models: 1, basePoints: 200, tiers: [{ minCount: 1, points: 200 }] },
      ],
      wargearOptions: [
        { name: "Doomsday gauss flayer", points: 10 },
      ],
    },
  ],
};

function freshStore() {
  setActivePinia(createPinia());
  const mfm = useMfmStore();
  // Inject our synthetic MFM as the only available version. The store treats
  // its `MFM` map as a flat dictionary keyed by version string, with a
  // `CURRENT` alias used as fallback.
  mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
  const list = useArmyListStore();
  list.setList({
    faction: FACTION,
    mfm_version: TEST_MFM.MFM_VERSION,
    maxPoints: 2000,
    units: [],
    detachments: [],
  });
  return list;
}

const unit = (overrides) => ({
  id: overrides.id ?? `id-${Math.random().toString(36).slice(2, 8)}`,
  models: 1,
  ...overrides,
});

describe("armyList.moveUnit", () => {
  let store;
  beforeEach(() => {
    store = freshStore();
  });

  it("attaches a unit by setting attachedTo and respecting sibling index", () => {
    store.setUnits([
      unit({ id: "host", name: "NECRON WARRIORS", models: 10 }),
      unit({ id: "leader", name: "IMOTEKH THE STORMLORD" }),
    ]);
    store.moveUnit("leader", "host", 0);
    const leader = store.units.find((u) => u.id === "leader");
    expect(leader.attachedTo).toBe("host");
  });

  it("clears attachedTo when re-parenting to null", () => {
    store.setUnits([
      unit({ id: "host", name: "NECRON WARRIORS", models: 10 }),
      unit({
        id: "leader",
        name: "IMOTEKH THE STORMLORD",
        attachedTo: "host",
      }),
    ]);
    store.moveUnit("leader", null, 1);
    const leader = store.units.find((u) => u.id === "leader");
    expect(leader.attachedTo).toBeUndefined();
  });

  it("repositions among siblings (root reorder)", () => {
    store.setUnits([
      unit({ id: "a", name: "NECRON WARRIORS", models: 10 }),
      unit({ id: "b", name: "NECRON WARRIORS", models: 10 }),
      unit({ id: "c", name: "NECRON WARRIORS", models: 10 }),
    ]);
    // Move c from index 2 to index 0
    store.moveUnit("c", null, 0);
    expect(store.units.map((u) => u.id)).toEqual(["c", "a", "b"]);
  });
});

describe("armyList.removeUnit", () => {
  let store;
  beforeEach(() => {
    store = freshStore();
  });

  it("removes the unit", () => {
    store.setUnits([
      unit({ id: "a", name: "NECRON WARRIORS", models: 10 }),
      unit({ id: "b", name: "NECRON WARRIORS", models: 10 }),
    ]);
    store.removeUnit("a");
    expect(store.units.map((u) => u.id)).toEqual(["b"]);
  });

  it("orphans attached children to root when their host is removed", () => {
    store.setUnits([
      unit({ id: "host", name: "NECRON WARRIORS", models: 10 }),
      unit({
        id: "leader",
        name: "IMOTEKH THE STORMLORD",
        attachedTo: "host",
      }),
      unit({
        id: "enh",
        name: "Enhancements",
        optionName: "Veil of Darkness",
        attachedTo: "leader",
      }),
    ]);
    store.removeUnit("host");
    const leader = store.units.find((u) => u.id === "leader");
    const enh = store.units.find((u) => u.id === "enh");
    expect(leader.attachedTo).toBeUndefined();
    // The enhancement was attached to the leader, not the host — that link
    // survives the removal of the host.
    expect(enh.attachedTo).toBe("leader");
  });
});

describe("armyList.removeUnitSubtree", () => {
  let store;
  beforeEach(() => {
    store = freshStore();
  });

  it("removes the unit AND every descendant (full subtree)", () => {
    store.setUnits([
      unit({ id: "host", name: "NECRON WARRIORS", models: 10 }),
      unit({ id: "leader", name: "IMOTEKH THE STORMLORD", attachedTo: "host" }),
      unit({
        id: "enh",
        name: "Enhancements",
        optionName: "Veil of Darkness",
        attachedTo: "leader",
      }),
      unit({ id: "other", name: "NECRON WARRIORS", models: 10 }),
    ]);
    store.removeUnitSubtree("host");
    expect(store.units.map((u) => u.id)).toEqual(["other"]);
  });

  it("removes a leaf with no descendants without disturbing siblings", () => {
    store.setUnits([
      unit({ id: "host", name: "NECRON WARRIORS", models: 10 }),
      unit({ id: "leader", name: "IMOTEKH THE STORMLORD", attachedTo: "host" }),
      unit({
        id: "enh",
        name: "Enhancements",
        optionName: "Veil of Darkness",
        attachedTo: "leader",
      }),
    ]);
    store.removeUnitSubtree("enh");
    expect(store.units.map((u) => u.id).sort()).toEqual(["host", "leader"]);
  });

  it("removing a middle node takes its descendants but leaves the parent untouched", () => {
    store.setUnits([
      unit({ id: "host", name: "NECRON WARRIORS", models: 10 }),
      unit({ id: "leader", name: "IMOTEKH THE STORMLORD", attachedTo: "host" }),
      unit({
        id: "enh",
        name: "Enhancements",
        optionName: "Veil of Darkness",
        attachedTo: "leader",
      }),
    ]);
    store.removeUnitSubtree("leader");
    expect(store.units.map((u) => u.id)).toEqual(["host"]);
  });

  it("no-ops if the id is not in the list", () => {
    store.setUnits([
      unit({ id: "a", name: "NECRON WARRIORS", models: 10 }),
    ]);
    store.removeUnitSubtree("ghost");
    expect(store.units.map((u) => u.id)).toEqual(["a"]);
  });
});

describe("armyList Support validation", () => {
  let store;
  beforeEach(() => {
    store = freshStore();
  });

  it("flags a Support character with no host", () => {
    const sup = unit({ id: "sup", name: "CHRONOMANCER" });
    store.setUnits([sup]);
    expect(store.getUnitValidationError(sup)).toBe(
      "Support character must attach to a unit"
    );
  });

  it("clears the error once the Support is attached to any host", () => {
    const sup = unit({
      id: "sup",
      name: "CHRONOMANCER",
      attachedTo: "host",
    });
    store.setUnits([
      unit({ id: "host", name: "NECRON WARRIORS", models: 10 }),
      sup,
    ]);
    expect(store.getUnitValidationError(sup)).toBe(false);
  });

  it("does NOT require Leaders to be attached", () => {
    const ldr = unit({ id: "ldr", name: "IMOTEKH THE STORMLORD" });
    store.setUnits([ldr]);
    expect(store.getUnitValidationError(ldr)).toBe(false);
  });

  it("flags a Leader attached to a host NOT in attachesTo", () => {
    const host = unit({
      id: "host",
      name: "CHRONOMANCER", // not in IMOTEKH.leader.attachesTo
    });
    const ldr = unit({
      id: "ldr",
      name: "IMOTEKH THE STORMLORD",
      attachedTo: "host",
    });
    store.setUnits([host, ldr]);
    expect(store.getUnitValidationError(ldr)).toMatch(
      /Leader can only attach to:/
    );
  });

  it("clears the Leader attach error once attached to a valid host", () => {
    const host = unit({ id: "host", name: "NECRON WARRIORS", models: 10 });
    const ldr = unit({
      id: "ldr",
      name: "IMOTEKH THE STORMLORD",
      attachedTo: "host",
    });
    store.setUnits([host, ldr]);
    expect(store.getUnitValidationError(ldr)).toBe(false);
  });

  it("flags a regular unit that's been attached to something", () => {
    // Reproduces the screenshot bug: a battleline bodyguard nested under a
    // Leader. drop-time rules now refuse this; pre-existing bad state lands
    // here.
    const root = unit({ id: "root", name: "NECRON WARRIORS", models: 10 });
    const ldr = unit({
      id: "ldr",
      name: "IMOTEKH THE STORMLORD",
      attachedTo: "root",
    });
    const bad = unit({
      id: "bad",
      name: "NECRON WARRIORS",
      models: 10,
      attachedTo: "ldr",
    });
    store.setUnits([root, ldr, bad]);
    expect(store.getUnitValidationError(bad)).toBe(
      "This unit can't be attached to another"
    );
  });
});

describe("armyList Enhancement validation", () => {
  let store;
  beforeEach(() => {
    setActivePinia(createPinia());
    const mfm = useMfmStore();
    // The store reads currentMFM via mfmStore.getVersion(version). The
    // closure-internal MFM dict can't be reassigned from outside, so we
    // override getVersion to hand back our synthetic MFM directly. This is
    // the only way to make `availableEnhancementNames` see test detachments
    // without touching the real game data.
    mfm.getVersion = (v) => (v === TEST_MFM.MFM_VERSION ? TEST_MFM : null);
    store = useArmyListStore();
    store.setList({
      faction: FACTION,
      mfm_version: TEST_MFM.MFM_VERSION,
      maxPoints: 2000,
      units: [],
      detachments: ["AWAKENED DYNASTY"],
    });
  });

  const enh = (id, optionName, attachedTo) => ({
    id,
    name: "Enhancements",
    optionName,
    attachedTo,
  });

  it("passes a single enhancement", () => {
    const e = enh("e1", "Veil of Darkness");
    store.setUnits([e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("passes two DIFFERENT enhancements", () => {
    const a = enh("a", "Veil of Darkness");
    const b = enh("b", "Arisen Tyrant");
    store.setUnits([a, b]);
    expect(store.getUnitValidationError(a)).toBe(false);
    expect(store.getUnitValidationError(b)).toBe(false);
  });

  it("flags duplicates: first wins, later copies report 'Duplicate enhancement'", () => {
    const first = enh("a", "Veil of Darkness");
    const dup = enh("b", "Veil of Darkness");
    store.setUnits([first, dup]);
    expect(store.getUnitValidationError(first)).toBe(false);
    expect(store.getUnitValidationError(dup)).toBe("Duplicate enhancement");
  });

  it("with three of the same: first passes, both later copies flag", () => {
    const a = enh("a", "Veil of Darkness");
    const b = enh("b", "Veil of Darkness");
    const c = enh("c", "Veil of Darkness");
    store.setUnits([a, b, c]);
    expect(store.getUnitValidationError(a)).toBe(false);
    expect(store.getUnitValidationError(b)).toBe("Duplicate enhancement");
    expect(store.getUnitValidationError(c)).toBe("Duplicate enhancement");
  });

  it("'not available in this detachment' takes precedence over 'Duplicate'", () => {
    // Even though there are two copies, neither is in the selected detachment.
    const a = enh("a", "Phantasmal Vigour");
    const b = enh("b", "Phantasmal Vigour");
    store.setUnits([a, b]);
    expect(store.getUnitValidationError(a)).toBe(
      "Enhancement not available in this detachment"
    );
    expect(store.getUnitValidationError(b)).toBe(
      "Enhancement not available in this detachment"
    );
  });

  // Host-eligibility (upgrade vs character). The synthetic TEST_MFM carries
  // the upgrade flag on enhancements; the host's `character` flag is read off
  // the host datasheet. The block's beforeEach overrides mfm.getVersion but
  // not mfm.MFM, so codexStore.getDataSheet falls back to real game data —
  // which means we use canonical Necron names (IMOTEKH THE STORMLORD,
  // NECRON WARRIORS, IMMORTALS) that exist in the real codex.

  const hostUnit = (id, name, models = 1) => ({ id, name, models });

  it("flags a non-upgrade enhancement attached to a non-character squad", () => {
    const host = hostUnit("host", "NECRON WARRIORS", 10);
    const e = { ...enh("e", "Veil of Darkness"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(
      "Enhancement can only attach to a character"
    );
  });

  it("flags an upgrade enhancement attached to a character", () => {
    const host = hostUnit("host", "IMOTEKH THE STORMLORD");
    const e = { ...enh("e", "Enlivened Sentinels"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(
      "Unit upgrades can't attach to characters"
    );
  });

  it("passes a non-upgrade enhancement attached to a character", () => {
    const host = hostUnit("host", "IMOTEKH THE STORMLORD");
    const e = { ...enh("e", "Veil of Darkness"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("passes an upgrade enhancement attached to a non-character squad", () => {
    const host = hostUnit("host", "NECRON WARRIORS", 10);
    const e = { ...enh("e", "Enlivened Sentinels"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("flags an enhancement attached to a host outside its allowedHosts whitelist", () => {
    // "Special Upgrade" has allowedHosts: ["NECRON WARRIORS"] in the test MFM.
    // IMMORTALS is a non-character squad too, but not in the whitelist.
    const host = hostUnit("host", "IMMORTALS", 10);
    const e = { ...enh("e", "Special Upgrade"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(
      "Enhancement can only attach to: NECRON WARRIORS"
    );
  });

  it("passes an enhancement attached to a host in its allowedHosts whitelist", () => {
    const host = hostUnit("host", "NECRON WARRIORS", 10);
    const e = { ...enh("e", "Special Upgrade"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("flags a missing host", () => {
    const e = { ...enh("e", "Veil of Darkness"), attachedTo: "ghost" };
    store.setUnits([e]);
    expect(store.getUnitValidationError(e)).toBe("Attached to a missing unit");
  });

  it("passes an unattached enhancement (no host check)", () => {
    const e = enh("e", "Veil of Darkness");
    store.setUnits([e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("getEnhancementMeta resolves the upgrade flag from the detachment", () => {
    expect(
      store.getEnhancementMeta(enh("a", "Enlivened Sentinels"))
    ).toMatchObject({ isUnitUpgrade: true });
    expect(
      store.getEnhancementMeta(enh("a", "Veil of Darkness"))?.isUnitUpgrade
    ).toBeFalsy();
    expect(store.getEnhancementMeta(enh("a", "Nonexistent"))).toBeNull();
  });
});

describe("armyList Wargear validation", () => {
  let store;
  beforeEach(() => {
    store = freshStore();
  });

  const wgr = (id, parentDataSheet, optionName, attachedTo) => ({
    id,
    name: "Wargear",
    parentDataSheet,
    optionName,
    attachedTo,
  });

  it("passes a wargear attached to a matching host with a known option", () => {
    const host = unit({ id: "h", name: "DOOMSDAY ARK", models: 1 });
    const w = wgr("w", "DOOMSDAY ARK", "Doomsday gauss flayer", "h");
    store.setUnits([host, w]);
    expect(store.getUnitValidationError(w)).toBe(false);
  });

  it("flags an unattached wargear", () => {
    const w = wgr("w", "DOOMSDAY ARK", "Doomsday gauss flayer");
    store.setUnits([w]);
    expect(store.getUnitValidationError(w)).toBe(
      "Wargear must be attached to a unit"
    );
  });

  it("flags a wargear whose host's datasheet does NOT match parentDataSheet", () => {
    const host = unit({ id: "h", name: "NECRON WARRIORS", models: 10 });
    const w = wgr("w", "DOOMSDAY ARK", "Doomsday gauss flayer", "h");
    store.setUnits([host, w]);
    expect(store.getUnitValidationError(w)).toBe(
      "Wargear belongs to DOOMSDAY ARK"
    );
  });

  it("flags a wargear whose option name is no longer on the host's datasheet", () => {
    const host = unit({ id: "h", name: "DOOMSDAY ARK", models: 1 });
    const w = wgr("w", "DOOMSDAY ARK", "Retired Option", "h");
    store.setUnits([host, w]);
    expect(store.getUnitValidationError(w)).toMatch(
      /Wargear option not available in MFM/
    );
  });

  it("flags a wargear whose host has been removed", () => {
    const w = wgr("w", "DOOMSDAY ARK", "Doomsday gauss flayer", "ghost-id");
    store.setUnits([w]);
    expect(store.getUnitValidationError(w)).toBe("Wargear's unit is missing");
  });

  it("passes 20 copies of the same wargear option on the same host", () => {
    // The synthetic option carries no maxPerUnit override, so the default
    // cap (20) applies. 20 copies should ALL pass — the 21st is what flags.
    const host = unit({ id: "h", name: "DOOMSDAY ARK", models: 1 });
    const copies = [];
    for (let i = 0; i < 20; i++) {
      copies.push(wgr(`w${i}`, "DOOMSDAY ARK", "Doomsday gauss flayer", "h"));
    }
    store.setUnits([host, ...copies]);
    for (const c of copies) {
      expect(store.getUnitValidationError(c)).toBe(false);
    }
  });

  it("flags the 21st copy of the same wargear option on the same host", () => {
    const host = unit({ id: "h", name: "DOOMSDAY ARK", models: 1 });
    const copies = [];
    for (let i = 0; i < 21; i++) {
      copies.push(wgr(`w${i}`, "DOOMSDAY ARK", "Doomsday gauss flayer", "h"));
    }
    store.setUnits([host, ...copies]);
    // The first 20 still pass; only the last one flags.
    for (let i = 0; i < 20; i++) {
      expect(store.getUnitValidationError(copies[i])).toBe(false);
    }
    expect(store.getUnitValidationError(copies[20])).toBe("Only 20 per unit");
  });

  it("splits 21 copies across two hosts and both pass (cap is per-host)", () => {
    const h1 = unit({ id: "h1", name: "DOOMSDAY ARK", models: 1 });
    const h2 = unit({ id: "h2", name: "DOOMSDAY ARK", models: 1 });
    const copies = [];
    for (let i = 0; i < 20; i++) {
      copies.push(wgr(`a${i}`, "DOOMSDAY ARK", "Doomsday gauss flayer", "h1"));
    }
    const onH2 = wgr("b0", "DOOMSDAY ARK", "Doomsday gauss flayer", "h2");
    store.setUnits([h1, h2, ...copies, onH2]);
    for (const c of copies) {
      expect(store.getUnitValidationError(c)).toBe(false);
    }
    expect(store.getUnitValidationError(onH2)).toBe(false);
  });
});

describe("armyList derived state — wargear isolation", () => {
  let store;
  beforeEach(() => {
    setActivePinia(createPinia());
    const mfm = useMfmStore();
    mfm.getVersion = (v) => (v === TEST_MFM.MFM_VERSION ? TEST_MFM : null);
    mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
    store = useArmyListStore();
    store.setList({
      faction: FACTION,
      mfm_version: TEST_MFM.MFM_VERSION,
      maxPoints: 2000,
      units: [],
      detachments: ["AWAKENED DYNASTY"],
    });
  });

  it("does NOT count wargear in unitCounts", () => {
    store.setUnits([
      { id: "h", name: "DOOMSDAY ARK", models: 1 },
      {
        id: "w",
        name: "Wargear",
        parentDataSheet: "DOOMSDAY ARK",
        optionName: "Doomsday gauss flayer",
        attachedTo: "h",
      },
    ]);
    expect(store.unitCounts["DOOMSDAY ARK"]).toBe(1);
    expect(store.unitCounts.Wargear).toBeUndefined();
  });

  it("does NOT leak wargear option names into enhancementsTaken", () => {
    store.setUnits([
      { id: "h", name: "DOOMSDAY ARK", models: 1 },
      {
        id: "w",
        name: "Wargear",
        parentDataSheet: "DOOMSDAY ARK",
        optionName: "Doomsday gauss flayer",
        attachedTo: "h",
      },
      {
        id: "e",
        name: "Enhancements",
        optionName: "Veil of Darkness",
      },
    ]);
    expect(store.enhancementsTaken.has("Veil of Darkness")).toBe(true);
    expect(store.enhancementsTaken.has("Doomsday gauss flayer")).toBe(
      false
    );
  });

  it("does NOT count wargear in totalEnhancementsCount", () => {
    store.setUnits([
      { id: "h", name: "DOOMSDAY ARK", models: 1 },
      {
        id: "w",
        name: "Wargear",
        parentDataSheet: "DOOMSDAY ARK",
        optionName: "Doomsday gauss flayer",
        attachedTo: "h",
      },
      { id: "e", name: "Enhancements", optionName: "Veil of Darkness" },
    ]);
    expect(store.totalEnhancementsCount).toBe(1);
  });

  it("orphans wargear (clears attachedTo) when its host is removed", () => {
    store.setUnits([
      { id: "h", name: "DOOMSDAY ARK", models: 1 },
      {
        id: "w",
        name: "Wargear",
        parentDataSheet: "DOOMSDAY ARK",
        optionName: "Doomsday gauss flayer",
        attachedTo: "h",
      },
    ]);
    store.removeUnit("h");
    const wargear = store.units.find((u) => u.id === "w");
    expect(wargear).toBeDefined();
    expect(wargear.attachedTo).toBeUndefined();
  });
});

