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
            {
              // Upgrade whose allowedHosts whitelists a CHARACTER. The
              // nonCharacterOnly "can't go on a character" default must yield to
              // the explicit allowedHosts override (§25.04 "unless otherwise
              // stated"), the same way the EPIC HERO default yields for
              // "Quantum Goad".
              name: "Char-allowed Upgrade",
              points: 5,
              nonCharacterOnly: true,
              allowedHosts: ["OVERLORD"],
            },
            { name: "Stackable Boon", points: 10, characterOnly: true },
            { name: "Unrestricted Boon", points: 10 },
            { name: "Not For Heroes", points: 15, characterOnly: true, notOnEpicHeroes: true, limit: 1 },
            {
              name: "Daemon-only Upgrade",
              points: 10,
              nonCharacterOnly: true,
              requiredKeywords: ["LEGIONES DAEMONICA KHORNE"],
            },
            {
              name: "Mixed Disjunction",
              points: 10,
              nonCharacterOnly: true,
              allowedHosts: ["NECRON WARRIORS"],
              requiredKeywords: ["ADEPTUS ASTARTES TERMINATOR"],
            },
            {
              // Real-world shape: Necron "Quantum Goad" whitelists the
              // Nightbringer (CHARACTER + EPIC HERO + MONSTER) as its only
              // legal host. The universal EPIC HERO block must yield to the
              // explicit allowedHosts whitelist here. The apostrophe is the
              // curly U+2019 form that MFM and the real auto.json use; this
              // also serves as a regression check that the validator's
              // byte-exact `host.name === entry` match preserves the unicode
              // through the Pinia store.
              name: "Quantum Goad",
              points: 25,
              allowedHosts: ["C’TAN SHARD OF THE NIGHTBRINGER"],
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
      keywords: ["BATTLELINE"],
      sizes: [
        { name: "10 models", models: 10, basePoints: 80, tiers: [{ minCount: 1, points: 80 }] },
      ],
    },
    {
      name: "IMOTEKH THE STORMLORD",
      faction: FACTION,
      edition: "11th",
      keywords: ["CHARACTER", "EPIC HERO"],
      leader: { attachesTo: ["NECRON WARRIORS"] },
      sizes: [
        { name: "1 model", models: 1, basePoints: 100, tiers: [{ minCount: 1, points: 100 }] },
      ],
    },
    {
      // Ordinary CHARACTER leader — used as the default attach host in tests
      // that need a valid CHARACTER target without the EPIC HERO complication.
      name: "OVERLORD",
      faction: FACTION,
      edition: "11th",
      keywords: ["CHARACTER"],
      leader: { attachesTo: ["NECRON WARRIORS"] },
      sizes: [
        { name: "1 model", models: 1, basePoints: 70, tiers: [{ minCount: 1, points: 70 }] },
      ],
    },
    {
      // EPIC HERO MONSTER used to verify that an enhancement explicitly
      // naming this datasheet in allowedHosts can attach despite the universal
      // EPIC HERO block (muster-armies §25.04 "unless otherwise stated").
      // Apostrophe is the curly U+2019 form matching MFM; the Quantum Goad
      // fixture's allowedHosts entry must use the same byte form (byte-exact
      // match).
      name: "C’TAN SHARD OF THE NIGHTBRINGER",
      faction: FACTION,
      edition: "11th",
      keywords: ["CHARACTER", "EPIC HERO", "FLY", "MONSTER", "NECRONS"],
      sizes: [
        { name: "1 model", models: 1, basePoints: 320, tiers: [{ minCount: 1, points: 320 }] },
      ],
    },
    {
      name: "CHRONOMANCER",
      faction: FACTION,
      edition: "11th",
      keywords: ["CHARACTER"],
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
    {
      // Explicit non-CHARACTER squad used by allowedHosts / requiredKeywords
      // tests as the "wrong host" stand-in. The Enhancement-validation
      // describe block only patches mfmStore.getVersion, not the codex
      // store's lookup, so without this entry getDataSheet("IMMORTALS")
      // falls through to real Necron data and a faulty keyword overlay
      // (mfm-pdf-keywords mis-classifying IMMORTALS as CHARACTER) would
      // mask the actual rule under test.
      name: "IMMORTALS",
      faction: FACTION,
      edition: "11th",
      keywords: ["BATTLELINE", "INFANTRY", "NECRONS"],
      sizes: [
        { name: "10 models", models: 10, basePoints: 140, tiers: [{ minCount: 1, points: 140 }] },
      ],
    },
    {
      // Non-character carrying "LEGIONES DAEMONICA KHORNE" — a legal host for
      // the keyword-only "Daemon-only Upgrade" (proves the keyword is matchable).
      name: "BLOODLETTERS",
      faction: FACTION,
      edition: "11th",
      keywords: ["BATTLELINE", "INFANTRY", "LEGIONES DAEMONICA KHORNE"],
      sizes: [
        { name: "10 models", models: 10, basePoints: 100, tiers: [{ minCount: 1, points: 100 }] },
      ],
    },
    {
      // CHARACTER carrying the SAME keyword — used to prove a requiredKeywords
      // match does NOT override the nonCharacterOnly "can't go on characters"
      // rule (only an explicit allowedHosts NAME does).
      name: "SKULLTAKER",
      faction: FACTION,
      edition: "11th",
      keywords: ["CHARACTER", "INFANTRY", "LEGIONES DAEMONICA KHORNE"],
      sizes: [
        { name: "1 model", models: 1, basePoints: 90, tiers: [{ minCount: 1, points: 90 }] },
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

  it("stamps forcedAttach when attaching with forced=true and clears it on detach", () => {
    store.setUnits([
      unit({ id: "host", name: "NECRON WARRIORS", models: 10 }),
      unit({ id: "guest", name: "NECRON WARRIORS", models: 10 }),
    ]);
    store.moveUnit("guest", "host", 0, true);
    expect(store.units.find((u) => u.id === "guest").forcedAttach).toBe(true);
    // Detaching to root drops the override.
    store.moveUnit("guest", null, 1);
    expect(store.units.find((u) => u.id === "guest").forcedAttach).toBeUndefined();
  });

  it("preserves an existing forcedAttach on a plain reorder (forced=undefined)", () => {
    store.setUnits([
      unit({ id: "host", name: "NECRON WARRIORS", models: 10 }),
      unit({ id: "g1", name: "NECRON WARRIORS", attachedTo: "host", forcedAttach: true }),
      unit({ id: "g2", name: "NECRON WARRIORS", attachedTo: "host" }),
    ]);
    // Reorder g1 within its host's children — no forced arg.
    store.moveUnit("g1", "host", 1);
    expect(store.units.find((u) => u.id === "g1").forcedAttach).toBe(true);
  });

  it("clears forcedAttach when re-attaching with forced=false", () => {
    store.setUnits([
      unit({ id: "host", name: "NECRON WARRIORS", models: 10 }),
      unit({ id: "guest", name: "NECRON WARRIORS", attachedTo: "host", forcedAttach: true }),
    ]);
    store.moveUnit("guest", "host", 0, false);
    expect(store.units.find((u) => u.id === "guest").forcedAttach).toBeUndefined();
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
    // The armyList store reads currentMFM via mfmStore.getVersion(version);
    // patching that hands back our synthetic MFM for availableEnhancementNames.
    // But the codex store's compendium reads mfmStore.MFM.CURRENT directly,
    // and falls back to real data if .MFM isn't reassigned — so we patch both.
    // Without the .MFM override, getDataSheet(name) for any datasheet absent
    // from TEST_MFM would silently resolve to the real codex (with its
    // keyword overlay), turning unrelated data-quality regressions into
    // spurious test failures here.
    mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
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
  // shape mirrors real-world usage). OVERLORD is a plain CHARACTER (no EPIC
  // HERO) so it survives the universal-default checks.
  const charHost = (id) => ({ id, name: "OVERLORD", models: 1 });

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

  it("a forcedLimit copy bypasses the same-name limit error", () => {
    const h1 = charHost("h1");
    const h2 = charHost("h2");
    const first = { ...enh("a", "Veil of Darkness"), attachedTo: "h1" };
    const dup = {
      ...enh("b", "Veil of Darkness"),
      attachedTo: "h2",
      forcedLimit: true,
    };
    store.setUnits([h1, h2, first, dup]);
    expect(store.getUnitValidationError(first)).toBe(false);
    expect(store.getUnitValidationError(dup)).toBe(false);
  });

  it("addEnhancement({ forced: true }) stamps forcedLimit on the unit", () => {
    store.addEnhancement({
      optionName: "Veil of Darkness",
      detachment: "AWAKENED DYNASTY",
      forced: true,
    });
    const added = store.units.find((u) => u.name === "Enhancements");
    expect(added.forcedLimit).toBe(true);
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

  it("defaults a normal enhancement with no `limit` to 1 per army (§25.04)", () => {
    // "Stackable Boon" has no limit field and is not an Upgrade, so the
    // universal same-name default of 1 applies: the 2nd+ copies are flagged.
    const h1 = charHost("h1");
    const h2 = charHost("h2");
    const h3 = charHost("h3");
    const a = { ...enh("a", "Stackable Boon"), attachedTo: "h1" };
    const b = { ...enh("b", "Stackable Boon"), attachedTo: "h2" };
    const c = { ...enh("c", "Stackable Boon"), attachedTo: "h3" };
    store.setUnits([h1, h2, h3, a, b, c]);
    expect(store.getUnitValidationError(a)).toBe(false);
    expect(store.getUnitValidationError(b)).toBe(
      "Only 1 of this enhancement allowed"
    );
    expect(store.getUnitValidationError(c)).toBe(
      "Only 1 of this enhancement allowed"
    );
  });

  it("defaults an Upgrade (no `limit`) to 3 per army, flagging the 4th", () => {
    // "Enlivened Sentinels" is nonCharacterOnly (an Upgrade) with no limit
    // field, so §25.04's up-to-three default applies. Upgrades attach to
    // non-CHARACTER units, so hosts are NECRON WARRIORS squads.
    const warrior = (id) => ({ id, name: "NECRON WARRIORS", models: 10 });
    const hosts = ["h1", "h2", "h3", "h4"].map(warrior);
    const copies = ["a", "b", "c", "d"].map((id, i) => ({
      ...enh(id, "Enlivened Sentinels"),
      attachedTo: hosts[i].id,
    }));
    store.setUnits([...hosts, ...copies]);
    expect(store.getUnitValidationError(copies[0])).toBe(false);
    expect(store.getUnitValidationError(copies[1])).toBe(false);
    expect(store.getUnitValidationError(copies[2])).toBe(false);
    expect(store.getUnitValidationError(copies[3])).toBe(
      "Only 3 of this enhancement allowed"
    );
  });

  it("an explicit `limit` overrides the same-name default", () => {
    // "Not For Heroes" carries limit: 1 explicitly; the default would also be
    // 1, but this pins the override path. Use a limit:1 enhancement and confirm
    // the cap message reports the explicit number.
    const h1 = charHost("h1");
    const h2 = charHost("h2");
    const a = { ...enh("a", "Not For Heroes"), attachedTo: "h1" };
    const b = { ...enh("b", "Not For Heroes"), attachedTo: "h2" };
    store.setUnits([h1, h2, a, b]);
    expect(store.getUnitValidationError(a)).toBe(false);
    expect(store.getUnitValidationError(b)).toBe(
      "Only 1 of this enhancement allowed"
    );
  });

  it("repeat Upgrade copies don't count toward the battle-size total (§25.04)", () => {
    // Three copies of one Upgrade bill a single slot, so adding four distinct
    // normal enhancements alongside stays within the Strike Force cap of 4;
    // a fifth distinct enhancement is what trips the cap, not the Upgrade
    // repeats. totalEnhancementsCount reflects the same billing.
    const warrior = (id) => ({ id, name: "NECRON WARRIORS", models: 10 });
    const wHosts = ["w1", "w2", "w3"].map(warrior);
    const upgrades = ["u1", "u2", "u3"].map((id, i) => ({
      ...enh(id, "Enlivened Sentinels"),
      attachedTo: wHosts[i].id,
    }));
    const cHosts = ["c1", "c2", "c3"].map((id) => charHost(id));
    const normals = [
      { ...enh("n1", "Veil of Darkness"), attachedTo: "c1" },
      { ...enh("n2", "Arisen Tyrant"), attachedTo: "c2" },
      { ...enh("n3", "Stackable Boon"), attachedTo: "c3" },
    ];
    store.setUnits([...wHosts, ...cHosts, ...upgrades, ...normals]);

    // 3 Upgrade copies (1 billable) + 3 distinct normals (3 billable) = 4 toward
    // the cap, so none are flagged. Without the carve-out the raw count of 6
    // would trip the Strike Force cap of 4.
    expect(store.totalEnhancementsCount).toBe(4);
    for (const u of [...upgrades, ...normals]) {
      expect(store.getUnitValidationError(u)).not.toBe(
        "Only 4 enhancements allowed in Strike Force"
      );
    }
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

  it("a forcedAttach enhancement on a non-character host produces no host-eligibility error", () => {
    const host = hostUnit("host", "NECRON WARRIORS", 10);
    const e = { ...enh("e", "Veil of Darkness"), attachedTo: "host", forcedAttach: true };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("a forcedAttach enhancement still trips the one-per-attached-unit HARD cap", () => {
    const host = hostUnit("host", "OVERLORD"); // plain CHARACTER
    const first = { ...enh("a", "Unrestricted Boon"), attachedTo: "host" };
    const second = {
      ...enh("b", "Stackable Boon"),
      attachedTo: "host",
      forcedAttach: true,
    };
    store.setUnits([host, first, second]);
    // The per-attached-unit cap is a HARD §25.04 rule — the override must NOT
    // relax it even though `second` is force-attached.
    expect(store.getUnitValidationError(first)).toBe(false);
    expect(store.getUnitValidationError(second)).toBe(
      "Only one enhancement per attached unit"
    );
  });

  it("still enforces army-construction limits on a forcedAttach enhancement (per-enhancement limit)", () => {
    // forcedAttach relaxes host eligibility, NOT the army-wide `limit` cap.
    const h1 = charHost("h1");
    const h2 = charHost("h2");
    const first = { ...enh("a", "Veil of Darkness"), attachedTo: "h1" };
    const dup = {
      ...enh("b", "Veil of Darkness"),
      attachedTo: "h2",
      forcedAttach: true,
    };
    store.setUnits([h1, h2, first, dup]);
    expect(store.getUnitValidationError(dup)).toBe(
      "Only 1 of this enhancement allowed"
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

  it("nonCharacterOnly block yields to an explicit allowedHosts whitelist on a CHARACTER host", () => {
    // "Char-allowed Upgrade" is nonCharacterOnly but whitelists OVERLORD (a
    // CHARACTER) in allowedHosts. The "upgrades can't go on characters" default
    // must yield to the explicit whitelist (§25.04 "unless otherwise stated"),
    // the same way the EPIC HERO block yields for Quantum Goad.
    const host = hostUnit("host", "OVERLORD");
    const e = { ...enh("e", "Char-allowed Upgrade"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("passes a characterOnly enhancement attached to a character", () => {
    const host = hostUnit("host", "OVERLORD");
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

  it("EPIC HERO block yields to an explicit allowedHosts whitelist (Quantum Goad on the Nightbringer; curly U+2019 apostrophe round-trip)", () => {
    // The host name MUST use the same curly U+2019 apostrophe as the
    // Quantum Goad fixture's allowedHosts entry — byte-exact match. This
    // doubles as a regression test that the validator preserves the
    // unicode through the Pinia store path.
    const host = hostUnit("host", "C’TAN SHARD OF THE NIGHTBRINGER");
    const e = { ...enh("e", "Quantum Goad"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("EPIC HERO block still fires for a different Epic Hero NOT named in allowedHosts (Quantum Goad on Imotekh)", () => {
    const host = hostUnit("host", "IMOTEKH THE STORMLORD");
    const e = { ...enh("e", "Quantum Goad"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(
      "Enhancement can't be given to Epic Heroes"
    );
  });

  it("by default (no restriction fields) an enhancement still requires CHARACTER (muster-armies §25.04)", () => {
    // "Unrestricted Boon" has no restriction fields. The universal default
    // from §25.04 ("Only CHARACTER units can be given enhancements unless
    // otherwise stated") fires anyway — a vehicle host gets rejected.
    const host = hostUnit("host", "DOOMSDAY ARK", 1);
    const e = { ...enh("e", "Unrestricted Boon"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(
      "Enhancement can only attach to a character"
    );
  });

  it("by default (no restriction fields) an enhancement passes on a plain CHARACTER host", () => {
    const host = hostUnit("host", "OVERLORD");
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

  it("requiredKeywords blocks hosts that don't carry every listed keyword", () => {
    // "Daemon-only Upgrade" has requiredKeywords: [LEGIONES DAEMONICA KHORNE].
    // IMMORTALS doesn't carry that keyword — the BSData overlay tags it as
    // BATTLELINE / INFANTRY / NECRONS, not Khorne — so the validator blocks
    // the attachment.
    const host = hostUnit("host", "IMMORTALS", 10);
    const e = { ...enh("e", "Daemon-only Upgrade"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toMatch(
      /^Enhancement can only attach to:.*LEGIONES DAEMONICA KHORNE/
    );
  });

  it("a nonCharacterOnly upgrade attaches to a NON-character carrying the required keyword", () => {
    // BLOODLETTERS has LEGIONES DAEMONICA KHORNE and is not a character, so the
    // keyword-only "Daemon-only Upgrade" is legal here. This is the positive
    // baseline for the character-block test below.
    const host = hostUnit("host", "BLOODLETTERS", 10);
    const e = { ...enh("e", "Daemon-only Upgrade"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("a requiredKeywords match does NOT override the character block (only an allowedHosts name does)", () => {
    // SKULLTAKER satisfies the requiredKeywords (LEGIONES DAEMONICA KHORNE) but
    // is a CHARACTER, and "Daemon-only Upgrade" has no allowedHosts naming it.
    // nonCharacterOnly means "not for characters", and a keyword match must NOT
    // grant character eligibility — otherwise e.g. an "ADEPTUS ASTARTES" upgrade
    // would attach to every Space Marine character.
    const host = hostUnit("host", "SKULLTAKER");
    const e = { ...enh("e", "Daemon-only Upgrade"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(
      "Unit upgrades can't attach to characters"
    );
  });

  it("allowedHosts OR requiredKeywords is a disjunction — name match alone passes", () => {
    // "Mixed Disjunction" has allowedHosts: [NECRON WARRIORS] AND
    // requiredKeywords: [ADEPTUS ASTARTES TERMINATOR]. The host is NECRON
    // WARRIORS by name, so it satisfies the disjunction even though it lacks
    // the TERMINATOR keyword.
    const host = hostUnit("host", "NECRON WARRIORS", 10);
    const e = { ...enh("e", "Mixed Disjunction"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toBe(false);
  });

  it("allowedHosts OR requiredKeywords blocks when neither side matches", () => {
    // Same enhancement, host that fails BOTH conditions — different name AND
    // missing the required keyword.
    const host = hostUnit("host", "IMMORTALS", 10);
    const e = { ...enh("e", "Mixed Disjunction"), attachedTo: "host" };
    store.setUnits([host, e]);
    expect(store.getUnitValidationError(e)).toMatch(
      /^Enhancement can only attach to: NECRON WARRIORS or unit with ADEPTUS ASTARTES TERMINATOR/
    );
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
      id: "ovr",
      name: "OVERLORD",
      models: 1,
      attachedTo: "w",
    };
    // "Enlivened Sentinels" is an Upgrade, so it legally targets the
    // non-CHARACTER squad. "Arisen Tyrant" is a plain enhancement, so it
    // legally targets the CHARACTER leader.
    const onSquad = {
      ...enh("a", "Enlivened Sentinels"),
      attachedTo: "w",
    };
    const onLeader = {
      ...enh("b", "Arisen Tyrant"),
      attachedTo: "ovr",
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
      name: "OVERLORD",
      models: 1,
      attachedTo: "w1",
    };
    const leader2 = {
      id: "l2",
      name: "OVERLORD",
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

  it("treats an Upgrade as taken only once it reaches its limit of 3", () => {
    const copies = (n) =>
      Array.from({ length: n }, (_, i) => ({
        id: `e${i}`,
        name: "Enhancements",
        optionName: "Enlivened Sentinels",
      }));
    store.setUnits(copies(2));
    expect(store.enhancementsTaken.has("Enlivened Sentinels")).toBe(false);
    store.setUnits(copies(3));
    expect(store.enhancementsTaken.has("Enlivened Sentinels")).toBe(true);
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

describe("armyList.toggleBonusBattleline", () => {
  let store;
  beforeEach(() => {
    store = freshStore();
  });

  it("adds a datasheet name when not already present", () => {
    expect(store.bonusBattleline).toEqual([]);
    store.toggleBonusBattleline("WARBIKERS");
    expect(store.bonusBattleline).toEqual(["WARBIKERS"]);
  });

  it("removes a datasheet name when already present", () => {
    store.toggleBonusBattleline("WARBIKERS");
    store.toggleBonusBattleline("WARBIKERS");
    expect(store.bonusBattleline).toEqual([]);
  });

  it("accumulates multiple distinct entries", () => {
    store.toggleBonusBattleline("WARBIKERS");
    store.toggleBonusBattleline("STORMBOYZ");
    expect(new Set(store.bonusBattleline)).toEqual(
      new Set(["WARBIKERS", "STORMBOYZ"])
    );
  });

  it("no-ops on falsy names", () => {
    store.toggleBonusBattleline("");
    store.toggleBonusBattleline(undefined);
    store.toggleBonusBattleline(null);
    expect(store.bonusBattleline).toEqual([]);
  });

  it("is included in toObject() output", () => {
    store.toggleBonusBattleline("WARBIKERS");
    expect(store.toObject().bonusBattleline).toEqual(["WARBIKERS"]);
  });

  it("survives a setList roundtrip", () => {
    store.toggleBonusBattleline("WARBIKERS");
    const snapshot = store.toObject();

    // Simulate loading a different list, then loading the snapshot back.
    store.setList({ faction: FACTION, units: [], detachments: [] });
    expect(store.bonusBattleline).toEqual([]);

    store.setList(snapshot);
    expect(store.bonusBattleline).toEqual(["WARBIKERS"]);
  });

  it("defaults to [] when setList receives a list without bonusBattleline", () => {
    store.setList({ faction: FACTION, units: [], detachments: [] });
    expect(store.bonusBattleline).toEqual([]);
  });
});

describe("armyList.mfm_version default", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // The setList watcher persists via localStorage; clear so cross-test
    // bleed from earlier suites can't masquerade as a "saved" current list.
    localStorage.clear();
  });

  it("initializes to MFM.CURRENT.MFM_VERSION on a fresh store", () => {
    // The bug this guards against: leaving mfm_version as "" meant the
    // VersionBar dropdown showed "unknown" and no version selected on first
    // app open, because autoUpgradeMFMVersion skips lists with falsy versions.
    const mfm = useMfmStore();
    mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
    const list = useArmyListStore();
    expect(list.mfm_version).toBe(TEST_MFM.MFM_VERSION);
  });

  it("falls back to empty string when MFM.CURRENT is missing", () => {
    const mfm = useMfmStore();
    mfm.MFM = {};
    const list = useArmyListStore();
    expect(list.mfm_version).toBe("");
  });

  it("loadFromStorage with no saved currentList preserves the default", () => {
    const mfm = useMfmStore();
    mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
    const list = useArmyListStore();
    list.loadFromStorage();
    expect(list.mfm_version).toBe(TEST_MFM.MFM_VERSION);
  });

  it("setList does not auto-migrate a saved list's mfm_version to CURRENT", () => {
    // Saved lists must keep their recorded version verbatim — the user
    // explicitly opted out of silent migration.
    const mfm = useMfmStore();
    mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
    const list = useArmyListStore();
    list.setList({
      faction: FACTION,
      mfm_version: "V0.9",
      units: [],
      detachments: [],
    });
    expect(list.mfm_version).toBe("V0.9");
  });

  it("setList preserves an empty mfm_version on a saved list", () => {
    // The VersionBar's "unknown" option exists specifically for legacy saved
    // lists whose mfm_version is empty. setList must leave that state alone
    // so the defensive UI can surface it.
    const mfm = useMfmStore();
    mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
    const list = useArmyListStore();
    list.setList({
      faction: FACTION,
      mfm_version: "",
      units: [],
      detachments: [],
    });
    expect(list.mfm_version).toBe("");
  });
});

