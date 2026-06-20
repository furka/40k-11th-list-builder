import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

import ArmyCodex from "../components/ArmyCodex.vue";
import { useArmyListStore } from "../stores/armyList";
import { useCodexStore } from "../stores/codex";
import { useAppStore } from "../stores/app";
import { useMfmStore } from "../stores/mfm";
import { GROUP_NONE, GROUP_ROLE } from "../data/constants";

const FACTION = "NECRONS";
const ALLY_FACTION = "AELDARI";

const TEST_MFM = {
  EDITION: "11th",
  MFM_VERSION: "V1.0 (test)",
  FACTIONS: [
    {
      name: FACTION,
      detachments: [
        { name: "AWAKENED DYNASTY", dp: 1, enhancements: [] },
        { name: "HEXMARK PROTOCOL", dp: 1, enhancements: [] },
      ],
    },
    {
      name: ALLY_FACTION,
      detachments: [],
    },
  ],
  DATA_SHEETS: [
    {
      name: "IMOTEKH",
      faction: FACTION,
      character: true,
      sizes: [{ name: "1 model", models: 1, basePoints: 100 }],
    },
    {
      name: "NECRON WARRIORS",
      faction: FACTION,
      battleLine: true,
      sizes: [{ name: "10 models", models: 10, basePoints: 100 }],
    },
    {
      name: "GHOST ARK",
      faction: FACTION,
      dedicatedTransport: true,
      sizes: [{ name: "1 model", models: 1, basePoints: 100 }],
    },
    {
      name: "DOOMSDAY ARK",
      faction: FACTION,
      sizes: [{ name: "1 model", models: 1, basePoints: 100 }],
    },
    {
      name: "FARSEER",
      faction: ALLY_FACTION,
      character: true,
      sizes: [{ name: "1 model", models: 1, basePoints: 100 }],
    },
  ],
};

function mountCodex({
  faction = FACTION,
  allies = [],
  group = GROUP_ROLE,
} = {}) {
  setActivePinia(createPinia());
  const mfm = useMfmStore();
  mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
  mfm.getVersion = (v) => (v === TEST_MFM.MFM_VERSION ? TEST_MFM : null);

  const codex = useCodexStore();
  codex.setCurrentMFM(TEST_MFM);
  codex.setFaction(faction);
  codex.setAllies(allies);

  const army = useArmyListStore();
  army.setList({
    faction,
    mfm_version: TEST_MFM.MFM_VERSION,
    maxPoints: 2000,
    units: [],
    detachments: [],
    allies,
  });

  const app = useAppStore();
  app.group = group;

  return mount(ArmyCodex, {
    global: {
      stubs: {
        DataSheet: {
          name: "DataSheet",
          template: "<div class='ds' :data-name='dataSheet.name' :data-allied='dataSheet.allied || false' />",
          props: ["dataSheet"],
        },
        CodexDetachmentCard: {
          name: "CodexDetachmentCard",
          template: "<div class='cdc' :data-name='detachment.name' />",
          props: ["detachment"],
        },
      },
    },
  });
}

describe("ArmyCodex.vue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the blank-state placeholder when no faction is selected on the army", async () => {
    setActivePinia(createPinia());
    const mfm = useMfmStore();
    mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
    mfm.getVersion = (v) => (v === TEST_MFM.MFM_VERSION ? TEST_MFM : null);
    useCodexStore().setCurrentMFM(TEST_MFM);
    // armyListStore.faction stays empty.
    const wrapper = mount(ArmyCodex, {
      global: {
        stubs: { DataSheet: true, CodexDetachmentCard: true },
      },
    });
    await nextTick();
    expect(wrapper.find(".codex__blank").exists()).toBe(true);
    expect(wrapper.find(".codex__blank").text()).toMatch(/hit\s+New/i);
  });

  it("renders all four primary-faction datasheets when grouping is ROLE", async () => {
    const wrapper = mountCodex({ group: GROUP_ROLE });
    await nextTick();
    const sheets = wrapper.findAll(".ds");
    expect(sheets).toHaveLength(4);
    expect(new Set(sheets.map((s) => s.attributes("data-name")))).toEqual(
      new Set(["IMOTEKH", "NECRON WARRIORS", "GHOST ARK", "DOOMSDAY ARK"])
    );
  });

  it("groups by role: Characters, Battle Line, Dedicated Transport, Other (titles render)", async () => {
    const wrapper = mountCodex({ group: GROUP_ROLE });
    await nextTick();
    const titles = wrapper
      .findAll(".codex__group-title")
      .map((t) => t.text())
      .filter((t) => !t.startsWith("Detachments")); // detachment section is handled separately
    expect(titles).toContain("Characters");
    expect(titles).toContain("Battle Line");
    expect(titles).toContain("Dedicated Transport");
    expect(titles).toContain("Other");
  });

  it("collapses to a single titleless group when grouping is NONE", async () => {
    const wrapper = mountCodex({ group: GROUP_NONE });
    await nextTick();
    const titles = wrapper
      .findAll(".codex__group-title")
      .map((t) => t.text())
      .filter((t) => !t.startsWith("Detachments"));
    expect(titles).toEqual([]);
    expect(wrapper.findAll(".ds")).toHaveLength(4);
  });

  it("renders an ally faction as its own scoped group with the faction-name prefix", async () => {
    const wrapper = mountCodex({
      allies: [ALLY_FACTION],
      group: GROUP_ROLE,
    });
    await nextTick();
    const titles = wrapper
      .findAll(".codex__group-title")
      .map((t) => t.text());
    // FARSEER (character, AELDARI) lands under "AELDARI — Characters".
    expect(titles).toContain(`${ALLY_FACTION} — Characters`);
    // The ally sheet was tagged as allied by the store.
    const farseer = wrapper.findAll(".ds").find((d) => d.attributes("data-name") === "FARSEER");
    expect(farseer.attributes("data-allied")).toBe("true");
  });

  it("renders one CodexDetachmentCard per filtered detachment", async () => {
    const wrapper = mountCodex();
    await nextTick();
    const cards = wrapper.findAll(".cdc");
    expect(cards).toHaveLength(2);
    expect(new Set(cards.map((c) => c.attributes("data-name")))).toEqual(
      new Set(["AWAKENED DYNASTY", "HEXMARK PROTOCOL"])
    );
  });

  it("shows the 'units are hidden' fallback when filteredCompendium is empty", async () => {
    // Reuse the unknown-faction trick: codexStore.setFaction("GHOST") yields
    // an empty filteredCompendium because no datasheet has that faction.
    // armyListStore.faction must still be truthy so we skip the blank state.
    setActivePinia(createPinia());
    const mfm = useMfmStore();
    mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
    mfm.getVersion = (v) => (v === TEST_MFM.MFM_VERSION ? TEST_MFM : null);
    const codex = useCodexStore();
    codex.setCurrentMFM(TEST_MFM);
    codex.setFaction("GHOST");
    const army = useArmyListStore();
    army.setList({
      faction: FACTION, // truthy → skip blank state
      mfm_version: TEST_MFM.MFM_VERSION,
      maxPoints: 2000,
      units: [],
      detachments: [],
    });
    const wrapper = mount(ArmyCodex, {
      global: {
        stubs: { DataSheet: true, CodexDetachmentCard: true },
      },
    });
    await nextTick();
    expect(wrapper.find(".codex__no-units").exists()).toBe(true);
    expect(wrapper.find(".codex__no-units").text()).toMatch(/hidden/i);
  });
});
