import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

import DataSheet from "../components/DataSheet.vue";
import { useArmyListStore } from "../stores/armyList";
import { useCodexStore } from "../stores/codex";
import { useAppStore } from "../stores/app";
import { useMfmStore } from "../stores/mfm";
import { GROUP_NONE, GROUP_ROLE } from "../data/constants";

const FACTION = "NECRONS";

const TEST_MFM = {
  EDITION: "11th",
  MFM_VERSION: "V1.0 (test)",
  FACTIONS: [
    {
      name: FACTION,
      detachments: [{ name: "AWAKENED DYNASTY", dp: 1, enhancements: [] }],
    },
  ],
  DATA_SHEETS: [
    {
      name: "NECRON WARRIORS",
      faction: FACTION,
      battleLine: true,
      sizes: [
        { name: "10 models", models: 10, basePoints: 100 },
        { name: "20 models", models: 20, basePoints: 200 },
      ],
    },
    {
      name: "IMOTEKH",
      faction: FACTION,
      character: true,
      epicHero: true,
      leader: { attachesTo: ["NECRON WARRIORS"] },
      sizes: [{ name: "1 model", models: 1, basePoints: 100 }],
    },
    {
      name: "CHRONOMANCER",
      faction: FACTION,
      character: true,
      support: { attachesTo: ["NECRON WARRIORS"] },
      sizes: [{ name: "1 model", models: 1, basePoints: 80 }],
    },
    {
      name: "DOOMSDAY ARK",
      faction: FACTION,
      sizes: [{ name: "1 model", models: 1, basePoints: 200 }],
      wargearOptions: [{ name: "Doomsday gauss flayer", points: 10 }],
    },
  ],
};

function setupStores({ group = GROUP_NONE } = {}) {
  setActivePinia(createPinia());
  const mfm = useMfmStore();
  mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
  mfm.getVersion = (v) => (v === TEST_MFM.MFM_VERSION ? TEST_MFM : null);
  const codex = useCodexStore();
  codex.setCurrentMFM(TEST_MFM);
  codex.setFaction(FACTION);
  const army = useArmyListStore();
  army.setList({
    faction: FACTION,
    mfm_version: TEST_MFM.MFM_VERSION,
    maxPoints: 2000,
    units: [],
    detachments: ["AWAKENED DYNASTY"],
  });
  const app = useAppStore();
  app.group = group;
  return { army, codex, app, mfm };
}

const sheetFor = (name) =>
  TEST_MFM.DATA_SHEETS.find((d) => d.name === name);

describe("DataSheet.vue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the datasheet name and size options for a basic unit", async () => {
    setupStores();
    const wrapper = mount(DataSheet, {
      props: { dataSheet: sheetFor("NECRON WARRIORS") },
    });
    await nextTick();
    expect(wrapper.find(".data-sheet__name").text()).toContain("NECRON WARRIORS");
    const options = wrapper.findAll("li");
    expect(options).toHaveLength(2);
    expect(options[0].text()).toMatch(/10\s*models/);
    expect(options[0].text()).toMatch(/100\s*pts/);
    expect(options[1].text()).toMatch(/20\s*models/);
    expect(options[1].text()).toMatch(/200\s*pts/);
  });

  it("clicking an option calls armyListStore.addUnit and bumps the count", async () => {
    const { army } = setupStores();
    const wrapper = mount(DataSheet, {
      props: { dataSheet: sheetFor("NECRON WARRIORS") },
    });
    await nextTick();
    await wrapper.findAll("li")[0].trigger("click");
    expect(army.units).toHaveLength(1);
    expect(army.units[0].name).toBe("NECRON WARRIORS");
    expect(army.units[0].optionName).toBe("10 models");
    expect(army.units[0].models).toBe(10);
    // The title bar prefixes "<count>/<max>" before the name; check the count
    // jumped to 1 after the click rather than pinning a specific max.
    await nextTick();
    expect(wrapper.find(".data-sheet__name").text()).toMatch(/^1\s*\/\s*\d+/);
  });

  it("renders inline role pills only when grouping is NONE", async () => {
    setupStores({ group: GROUP_NONE });
    const w1 = mount(DataSheet, {
      props: { dataSheet: sheetFor("NECRON WARRIORS") },
    });
    await nextTick();
    // Battle Line → "B" pill
    expect(w1.findAll(".data-sheet__pill").map((p) => p.text())).toContain("B");

    setupStores({ group: GROUP_ROLE });
    const w2 = mount(DataSheet, {
      props: { dataSheet: sheetFor("NECRON WARRIORS") },
    });
    await nextTick();
    // Grouping is by role, so the inline B pill is suppressed.
    expect(w2.findAll(".data-sheet__pill").map((p) => p.text())).not.toContain("B");
  });

  it("always renders the Epic Hero pill regardless of grouping mode", async () => {
    setupStores({ group: GROUP_ROLE });
    const wrapper = mount(DataSheet, {
      props: { dataSheet: sheetFor("IMOTEKH") },
    });
    await nextTick();
    expect(
      wrapper.findAll(".data-sheet__pill").map((p) => p.text())
    ).toContain("E");
  });

  it("renders the Leader role-row when the datasheet has leader.attachesTo", async () => {
    setupStores();
    const wrapper = mount(DataSheet, {
      props: { dataSheet: sheetFor("IMOTEKH") },
    });
    await nextTick();
    const row = wrapper.find(".data-sheet__role-row");
    expect(row.exists()).toBe(true);
    expect(row.text()).toMatch(/Leader/);
    expect(row.text()).toMatch(/NECRON WARRIORS/);
  });

  it("renders the wargear options section and clicking a wargear option attaches it to a host", async () => {
    const { army } = setupStores();
    // Seed a host unit so wargearAvailable() finds a target.
    army.setUnits([
      {
        id: "host",
        name: "DOOMSDAY ARK",
        optionName: "1 model",
        models: 1,
      },
    ]);
    const wrapper = mount(DataSheet, {
      props: { dataSheet: sheetFor("DOOMSDAY ARK") },
    });
    await nextTick();
    // The wargear label renders.
    expect(wrapper.text()).toMatch(/WARGEAR OPTIONS/);
    // The wargear li is in the second ul (after the size options).
    const wargearLis = wrapper.findAll("ul")[1].findAll("li");
    expect(wargearLis).toHaveLength(1);
    expect(wargearLis[0].text()).toMatch(/per Doomsday gauss flayer/i);

    await wargearLis[0].trigger("click");
    const wargearUnit = army.units.find((u) => u.name === "Wargear");
    expect(wargearUnit).toBeDefined();
    expect(wargearUnit.parentDataSheet).toBe("DOOMSDAY ARK");
    expect(wargearUnit.optionName).toBe("Doomsday gauss flayer");
    expect(wargearUnit.attachedTo).toBe("host");
  });

  it("auto-attaches a Support character to the first legal host on click", async () => {
    const { army } = setupStores();
    army.setUnits([
      {
        id: "warriors",
        name: "NECRON WARRIORS",
        optionName: "10 models",
        models: 10,
      },
    ]);
    const wrapper = mount(DataSheet, {
      props: { dataSheet: sheetFor("CHRONOMANCER") },
    });
    await nextTick();
    await wrapper.findAll("li")[0].trigger("click");
    const chrono = army.units.find((u) => u.name === "CHRONOMANCER");
    expect(chrono).toBeDefined();
    expect(chrono.attachedTo).toBe("warriors");
  });

  it("renders nothing when the unit has no size options at all", async () => {
    setupStores();
    const wrapper = mount(DataSheet, {
      props: {
        dataSheet: {
          name: "EMPTY UNIT",
          faction: FACTION,
          sizes: [],
        },
      },
    });
    await nextTick();
    // The v-if on .data-sheet fails, so the root div is not rendered.
    expect(wrapper.find(".data-sheet").exists()).toBe(false);
  });
});
