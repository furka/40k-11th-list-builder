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
            { name: "Veil of Darkness", points: 25, characterOnly: true, limit: 1 },
            { name: "Arisen Tyrant", points: 30, characterOnly: true, limit: 1 },
            { name: "Enlivened Sentinels", points: 20, nonCharacterOnly: true },
            {
              name: "Special Upgrade",
              points: 5,
              nonCharacterOnly: true,
              allowedHosts: ["NECRON WARRIORS"],
            },
            { name: "Stackable Boon", points: 10, characterOnly: true },
            { name: "Unrestricted Boon", points: 10 },
            { name: "Not For Heroes", points: 15, characterOnly: true, notOnEpicHeroes: true, limit: 1 },
            {
              name: "Daemon-only Upgrade",
              points: 10,
              requiredKeywords: ["LEGIONES DAEMONICA KHORNE"],
            },
            {
              name: "Mixed Disjunction",
              points: 10,
              allowedHosts: ["NECRON WARRIORS"],
              requiredKeywords: ["ADEPTUS ASTARTES TERMINATOR"],
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
      epicHero: true,
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

describe("armyList.addEnhancement", () => {
  let store;
  beforeEach(() => {
    // The base freshStore() doesn't wire mfm.getVersion to our synthetic MFM,
    // so `getEnhancementMeta` would return null and the legalDropSlots check
    // wouldn't see characterOnly / allowedHosts restrictions. Mirror the
    // pattern used by the "Enhancement validation" describe block (line ~405).
    setActivePinia(createPinia());
    const mfm = useMfmStore();
    mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
    mfm.getVersion = (v) => (v === TEST_MFM.MFM_VERSION ? TEST_MFM : null);
    store = useArmyListStore();
    store.setList({
      faction: FACTION,
      mfm_version: TEST_MFM.MFM_VERSION,
      maxPoints: 2000,
      units: [],
      detachments: [],
    });
  });

  it("attaches to the first valid host in flat-array order", () => {
    store.setUnits([
      unit({ id: "warriors-a", name: "NECRON WARRIORS", models: 10 }),
      unit({ id: "warriors-b", name: "NECRON WARRIORS", models: 10 }),
    ]);
    store.addEnhancement({
      optionName: "Enlivened Sentinels",
      detachment: "AWAKENED DYNASTY",
    });
    const enh = store.units.find((u) => u.name === "Enhancements");
    expect(enh.attachedTo).toBe("warriors-a");
  });

  it("leaves the enhancement at root when no valid host exists", () => {
    // No hosts at all — the new enhancement should land in the list but
    // unattached, matching the drag-to-empty-list behavior.
    store.addEnhancement({
      optionName: "Enlivened Sentinels",
      detachment: "AWAKENED DYNASTY",
    });
    const enh = store.units.find((u) => u.name === "Enhancements");
    expect(enh).toBeDefined();
    expect(enh.attachedTo).toBeUndefined();
  });

  it("skips ineligible hosts to find a legal one (respects characterOnly)", () => {
    // Warriors come first in the array but Veil of Darkness is character-only,
    // so the store should walk past them to the character (CHRONOMANCER).
    store.setUnits([
      unit({ id: "warriors", name: "NECRON WARRIORS", models: 10 }),
      unit({ id: "chrono", name: "CHRONOMANCER" }),
    ]);
    store.addEnhancement({
      optionName: "Veil of Darkness",
      detachment: "AWAKENED DYNASTY",
    });
    const enh = store.units.find((u) => u.name === "Enhancements");
    expect(enh.attachedTo).toBe("chrono");
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

  // Host stand-in for tests that need a valid attachment target. Distinct
  // ids per host keep duplicate-limit tests from also tripping the drag-time
  // "max 1 enh per host" rule (which the validator doesn't enforce, but the
  // shape mirrors real-world usage).
  const charHost = (id) => ({ id, name: "IMOTEKH THE STORMLORD", models: 1 });

  it("passes a single enhancement attached to a valid host", () => {
    const h = charHost("h");
    const e = { ...enh("e1", "Veil of Darkness"), attachedTo: "h" };
    store.setUnits([h, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("passes two DIFFERENT enhancements", () => {
    const h1 = charHost("h1");
    const h2 = charHost("h2");
    const a = { ...enh("a", "Veil of Darkness"), attachedTo: "h1" };
    const b = { ...enh("b", "Arisen Tyrant"), attachedTo: "h2" };
    store.setUnits([h1, h2, a, b]);
    expect(store.getUnitValidationError(a)).toBe(false);
    expect(store.getUnitValidationError(b)).toBe(false);
  });

  it("flags copies past `limit`: first wins, later copies report the cap", () => {
    // "Veil of Darkness" has limit: 1 in the test MFM.
    const h1 = charHost("h1");
    const h2 = charHost("h2");
    const first = { ...enh("a", "Veil of Darkness"), attachedTo: "h1" };
    const dup = { ...enh("b", "Veil of Darkness"), attachedTo: "h2" };
    store.setUnits([h1, h2, first, dup]);
    expect(store.getUnitValidationError(first)).toBe(false);
    expect(store.getUnitValidationError(dup)).toBe(
      "Only 1 of this enhancement allowed"
    );
  });

  it("with three copies of a limit-1 enhancement, both later copies flag", () => {
    const h1 = charHost("h1");
    const h2 = charHost("h2");
    const h3 = charHost("h3");
    const a = { ...enh("a", "Veil of Darkness"), attachedTo: "h1" };
    const b = { ...enh("b", "Veil of Darkness"), attachedTo: "h2" };
    const c = { ...enh("c", "Veil of Darkness"), attachedTo: "h3" };
    store.setUnits([h1, h2, h3, a, b, c]);
    expect(store.getUnitValidationError(a)).toBe(false);
    expect(store.getUnitValidationError(b)).toBe(
      "Only 1 of this enhancement allowed"
    );
    expect(store.getUnitValidationError(c)).toBe(
      "Only 1 of this enhancement allowed"
    );
  });

  it("permits any number of copies of an enhancement with no `limit`", () => {
    // "Stackable Boon" has no limit field; the validator should not flag
    // duplicates.
    const h1 = charHost("h1");
    const h2 = charHost("h2");
    const h3 = charHost("h3");
    const a = { ...enh("a", "Stackable Boon"), attachedTo: "h1" };
    const b = { ...enh("b", "Stackable Boon"), attachedTo: "h2" };
    const c = { ...enh("c", "Stackable Boon"), attachedTo: "h3" };
    store.setUnits([h1, h2, h3, a, b, c]);
    expect(store.getUnitValidationError(a)).toBe(false);
    expect(store.getUnitValidationError(b)).toBe(false);
    expect(store.getUnitValidationError(c)).toBe(false);
  });

  it("'not available in this detachment' takes precedence over the limit cap", () => {
    // Even though there are two copies, neither is in the selected detachment.
    const h1 = charHost("h1");
    const h2 = charHost("h2");
    const a = { ...enh("a", "Phantasmal Vigour"), attachedTo: "h1" };
    const b = { ...enh("b", "Phantasmal Vigour"), attachedTo: "h2" };
    store.setUnits([h1, h2, a, b]);
    expect(store.getUnitValidationError(a)).toBe(
      "Enhancement not available in this detachment"
    );
    expect(store.getUnitValidationError(b)).toBe(
      "Enhancement not available in this detachment"
    );
  });

  it("flags an unattached enhancement", () => {
    const e = enh("e", "Veil of Darkness");
    store.setUnits([e]);
    expect(store.getUnitValidationError(e)).toBe(
      "Enhancement must be attached to a unit"
    );
  });

  it("flags an enhancement attached to another enhancement", () => {
    const host = charHost("h");
    const parentEnh = { ...enh("p", "Veil of Darkness"), attachedTo: "h" };
    const childEnh = { ...enh("c", "Arisen Tyrant"), attachedTo: "p" };
    store.setUnits([host, parentEnh, childEnh]);
    expect(store.getUnitValidationError(childEnh)).toBe(
      "Enhancement can't be attached to another enhancement"
    );
  });

  // Host-eligibility — each restriction field is checked independently and
  // only when set. The synthetic TEST_MFM uses the new schema fields. The
  // block's beforeEach overrides mfm.getVersion but not mfm.MFM, so
  // codexStore.getDataSheet falls back to real game data — which means we
  // use canonical Necron names (IMOTEKH THE STORMLORD, NECRON WARRIORS,
  // IMMORTALS) that exist in the real codex.

  const hostUnit = (id, name, models = 1) => ({ id, name, models });

  it("flags a characterOnly enhancement attached to a non-character squad", () => {
    const host = hostUnit("host", "NECRON WARRIORS", 10);
    const e = { ...enh("e", "Veil of Darkness"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(
      "Enhancement can only attach to a character"
    );
  });

  it("flags a nonCharacterOnly enhancement attached to a character", () => {
    const host = hostUnit("host", "IMOTEKH THE STORMLORD");
    const e = { ...enh("e", "Enlivened Sentinels"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(
      "Unit upgrades can't attach to characters"
    );
  });

  it("passes a characterOnly enhancement attached to a character", () => {
    const host = hostUnit("host", "IMOTEKH THE STORMLORD");
    const e = { ...enh("e", "Veil of Darkness"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("passes a nonCharacterOnly enhancement attached to a non-character squad", () => {
    const host = hostUnit("host", "NECRON WARRIORS", 10);
    const e = { ...enh("e", "Enlivened Sentinels"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("flags a notOnEpicHeroes enhancement attached to an epic hero", () => {
    const host = hostUnit("host", "IMOTEKH THE STORMLORD"); // character + epicHero
    const e = { ...enh("e", "Not For Heroes"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(
      "Enhancement can't be given to Epic Heroes"
    );
  });

  it("by default (no restriction fields) an enhancement passes on any host", () => {
    // "Unrestricted Boon" has no restriction fields. Attach it to a vehicle
    // (no character, no epicHero) and confirm the validator stays silent.
    const host = hostUnit("host", "DOOMSDAY ARK", 1);
    const e = { ...enh("e", "Unrestricted Boon"), attachedTo: "host" };
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

  it("requiredKeywords alone is dormant: passes on any host (no enforcement yet)", () => {
    // "Daemon-only Upgrade" has only requiredKeywords — the validator
    // captures it for the future keyword-aware path but doesn't enforce.
    const host = hostUnit("host", "IMMORTALS", 10);
    const e = { ...enh("e", "Daemon-only Upgrade"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("allowedHosts is suppressed when requiredKeywords is also present", () => {
    // "Mixed Disjunction" has allowedHosts: [NECRON WARRIORS] AND
    // requiredKeywords: [ADEPTUS ASTARTES TERMINATOR]. The captured rule
    // was a disjunction; the validator can't fully check it, so it skips
    // enforcement entirely (under-enforce rather than wrongly block).
    const host = hostUnit("host", "IMMORTALS", 10);
    const e = { ...enh("e", "Mixed Disjunction"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("flags a missing host", () => {
    const e = { ...enh("e", "Veil of Darkness"), attachedTo: "ghost" };
    store.setUnits([e]);
    expect(store.getUnitValidationError(e)).toBe("Attached to a missing unit");
  });

  // 25.04 "No unit (including attached units) can have more than one
  // enhancement." A Leader attached to a Bodyguard squad shares one attached
  // unit, so the second enhancement anywhere in that tree flags.
  it("flags a second enhancement in the same attached unit (one on squad, one on attached leader)", () => {
    const squad = { id: "w", name: "NECRON WARRIORS", models: 10 };
    const leader = {
      id: "imo",
      name: "IMOTEKH THE STORMLORD",
      models: 1,
      attachedTo: "w",
    };
    const onSquad = {
      ...enh("a", "Unrestricted Boon"),
      attachedTo: "w",
    };
    const onLeader = {
      ...enh("b", "Arisen Tyrant"),
      attachedTo: "imo",
    };
    store.setUnits([squad, leader, onSquad, onLeader]);
    expect(store.getUnitValidationError(onSquad)).toBe(false);
    expect(store.getUnitValidationError(onLeader)).toBe(
      "Only one enhancement per attached unit"
    );
  });

  it("allows two enhancements when they live on DIFFERENT attached units", () => {
    const squad1 = { id: "w1", name: "NECRON WARRIORS", models: 10 };
    const squad2 = { id: "w2", name: "NECRON WARRIORS", models: 10 };
    const leader1 = {
      id: "l1",
      name: "IMOTEKH THE STORMLORD",
      models: 1,
      attachedTo: "w1",
    };
    const leader2 = {
      id: "l2",
      name: "IMOTEKH THE STORMLORD",
      models: 1,
      attachedTo: "w2",
    };
    const a = { ...enh("a", "Arisen Tyrant"), attachedTo: "l1" };
    const b = { ...enh("b", "Unrestricted Boon"), attachedTo: "l2" };
    store.setUnits([squad1, squad2, leader1, leader2, a, b]);
    expect(store.getUnitValidationError(a)).toBe(false);
    expect(store.getUnitValidationError(b)).toBe(false);
  });

  it("getEnhancementMeta resolves the restriction flags from the detachment", () => {
    expect(
      store.getEnhancementMeta(enh("a", "Enlivened Sentinels"))
    ).toMatchObject({ nonCharacterOnly: true });
    expect(
      store.getEnhancementMeta(enh("a", "Veil of Darkness"))?.nonCharacterOnly
    ).toBeFalsy();
    expect(
      store.getEnhancementMeta(enh("a", "Veil of Darkness"))
    ).toMatchObject({ characterOnly: true, limit: 1 });
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

describe("armyList.whyCantAddDetachment — UNIQUE keyword exclusivity", () => {
  const DET_MFM = {
    EDITION: "11th",
    MFM_VERSION: "V1.0 (detachment-test)",
    FACTIONS: [
      {
        name: FACTION,
        detachments: [
          { name: "ALPHA",  dp: 1, role: null, leader: null, tags: ["UNIQUE: LIONS"],   enhancements: [] },
          { name: "BRAVO",  dp: 1, role: null, leader: null, tags: ["UNIQUE: LIONS"],   enhancements: [] },
          { name: "CHARLIE",dp: 1, role: null, leader: null, tags: ["UNIQUE: ARMOURY"], enhancements: [] },
          { name: "DELTA",  dp: 1, role: null, leader: null, tags: [],                  enhancements: [] },
          { name: "ECHO",   dp: 1, role: null, leader: null,                            enhancements: [] },
          { name: "BIG",    dp: 3, role: null, leader: null, tags: ["UNIQUE: LIONS"],   enhancements: [] },
        ],
      },
    ],
    DATA_SHEETS: [],
  };

  let store;
  beforeEach(() => {
    setActivePinia(createPinia());
    const mfm = useMfmStore();
    mfm.MFM = { CURRENT: DET_MFM, [DET_MFM.MFM_VERSION]: DET_MFM };
    mfm.getVersion = (v) => (v === DET_MFM.MFM_VERSION ? DET_MFM : null);
    store = useArmyListStore();
    store.setList({
      faction: FACTION,
      mfm_version: DET_MFM.MFM_VERSION,
      maxPoints: 2000,
      units: [],
      detachments: [],
    });
  });

  it("blocks a detachment sharing a UNIQUE tag with an already-added one", () => {
    expect(store.addDetachment("ALPHA")).toBe(true);
    expect(store.whyCantAddDetachment("BRAVO")).toBe(
      "Cannot share UNIQUE: LIONS keyword"
    );
    expect(store.addDetachment("BRAVO")).toBe(false);
  });

  it("allows two detachments with DIFFERENT UNIQUE tags", () => {
    expect(store.addDetachment("ALPHA")).toBe(true);
    expect(store.whyCantAddDetachment("CHARLIE")).toBeNull();
    expect(store.addDetachment("CHARLIE")).toBe(true);
  });

  it("allows a UNIQUE-tagged detachment alongside a non-tagged one", () => {
    expect(store.addDetachment("ALPHA")).toBe(true);
    expect(store.whyCantAddDetachment("DELTA")).toBeNull();
    expect(store.addDetachment("DELTA")).toBe(true);
  });

  it("allows a detachment with no tags field at all (parity with missing-meta path)", () => {
    expect(store.addDetachment("ECHO")).toBe(true);
    expect(store.whyCantAddDetachment("DELTA")).toBeNull();
  });

  it("3-DP exclusivity still takes precedence over the UNIQUE check", () => {
    // BIG carries UNIQUE: LIONS too, but it's also 3-DP, so once ALPHA is in
    // we should hit the existing "3-DP detachments can't be combined…" reason
    // rather than the new UNIQUE one. The candidate's own 3-DP check fires
    // first in the function order.
    expect(store.addDetachment("ALPHA")).toBe(true);
    expect(store.whyCantAddDetachment("BIG")).toBe(
      "3-DP detachments can't be combined with other detachments"
    );
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

