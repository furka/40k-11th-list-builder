import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

import DataSheet from "../components/DataSheet.vue";
import { useArmyListStore } from "../stores/armyList";
import { useCodexStore } from "../stores/codex";
import { useAppStore } from "../stores/app";
import { useMfmStore } from "../stores/mfm";
import { GROUP_ROLE } from "../data/constants";

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
      keywords: ["BATTLELINE"],
      sizes: [
        { name: "10 models", models: 10, basePoints: 100 },
        { name: "20 models", models: 20, basePoints: 200 },
      ],
    },
    {
      name: "IMOTEKH",
      faction: FACTION,
      keywords: ["CHARACTER", "EPIC HERO"],
      leader: { attachesTo: ["NECRON WARRIORS"] },
      sizes: [{ name: "1 model", models: 1, basePoints: 100 }],
    },
    {
      name: "CHRONOMANCER",
      faction: FACTION,
      keywords: ["CHARACTER"],
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

function setupStores({ group = GROUP_ROLE } = {}) {
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

  it("does not render inline role pills (B/C/T) — role information is conveyed by group headers", async () => {
    setupStores({ group: GROUP_ROLE });
    const w1 = mount(DataSheet, {
      props: { dataSheet: sheetFor("NECRON WARRIORS") },
    });
    await nextTick();
    expect(w1.findAll(".data-sheet__pill").map((p) => p.text())).not.toContain("B");
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

describe("DataSheet.vue — points-change highlight", () => {
  const PREV_MFM = {
    MFM_VERSION: "V1.0",
    FACTIONS: [{ name: FACTION, detachments: [] }],
    DATA_SHEETS: [
      {
        name: "NECRON WARRIORS",
        faction: FACTION,
        sizes: [
          { name: "10 models", models: 10, basePoints: 80 },
          { name: "20 models", models: 20, basePoints: 200 },
        ],
      },
      {
        name: "CHRONOMANCER",
        faction: FACTION,
        sizes: [{ name: "1 model", models: 1, basePoints: 80 }],
      },
    ],
  };

  const CUR_MFM = {
    MFM_VERSION: "V1.1",
    FACTIONS: [{ name: FACTION, detachments: [] }],
    DATA_SHEETS: [
      {
        name: "NECRON WARRIORS",
        faction: FACTION,
        sizes: [
          { name: "10 models", models: 10, basePoints: 90 },
          { name: "20 models", models: 20, basePoints: 200 },
        ],
      },
      {
        name: "CHRONOMANCER",
        faction: FACTION,
        sizes: [{ name: "1 model", models: 1, basePoints: 70 }],
      },
      {
        // Brand-new datasheet — absent from PREV_MFM, so no spurious delta.
        name: "TRIARCH STALKER",
        faction: FACTION,
        sizes: [{ name: "1 model", models: 1, basePoints: 110 }],
      },
    ],
  };

  const curSheet = (name) => CUR_MFM.DATA_SHEETS.find((d) => d.name === name);

  function setupDeltaStores({ showPointsChanges = true } = {}) {
    setActivePinia(createPinia());
    const mfm = useMfmStore();
    mfm.MFM = {
      CURRENT: CUR_MFM,
      PREVIOUS: PREV_MFM,
      [CUR_MFM.MFM_VERSION]: CUR_MFM,
      [PREV_MFM.MFM_VERSION]: PREV_MFM,
    };
    mfm.getVersion = (v) =>
      v === CUR_MFM.MFM_VERSION
        ? CUR_MFM
        : v === PREV_MFM.MFM_VERSION
          ? PREV_MFM
          : null;
    // The real getPreviousMFM closes over the loaded manual, not the test
    // object, so stub the version chain explicitly. Compare by version rather
    // than identity: Pinia hands components a reactive proxy of the MFM, so
    // `m === CUR_MFM` would fail (the real manual is deep-frozen, hence stable).
    mfm.getPreviousMFM = (m) =>
      m?.MFM_VERSION === CUR_MFM.MFM_VERSION ? PREV_MFM : null;

    const codex = useCodexStore();
    codex.setCurrentMFM(CUR_MFM);
    codex.setFaction(FACTION);
    const army = useArmyListStore();
    army.setList({
      faction: FACTION,
      mfm_version: CUR_MFM.MFM_VERSION,
      maxPoints: 2000,
      units: [],
      detachments: [],
    });
    const app = useAppStore();
    app.showPointsChanges = showPointsChanges;
    return { mfm, codex, army, app };
  }

  const pointsSpans = (wrapper) => wrapper.findAll(".data-sheet__points");

  it("colors and badges an increased price when the toggle is on", async () => {
    setupDeltaStores();
    const wrapper = mount(DataSheet, {
      props: { dataSheet: curSheet("NECRON WARRIORS") },
    });
    await nextTick();
    const [tenModels, twentyModels] = pointsSpans(wrapper);

    expect(tenModels.classes()).toContain("data-sheet__points--up");
    const badge = tenModels.find(".data-sheet__points-delta");
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toContain("▲");
    expect(badge.text()).toContain("10");

    // Unchanged size: no color, no badge.
    expect(twentyModels.classes()).not.toContain("data-sheet__points--up");
    expect(twentyModels.classes()).not.toContain("data-sheet__points--down");
    expect(twentyModels.find(".data-sheet__points-delta").exists()).toBe(false);
  });

  it("colors and badges a decreased price", async () => {
    setupDeltaStores();
    const wrapper = mount(DataSheet, {
      props: { dataSheet: curSheet("CHRONOMANCER") },
    });
    await nextTick();
    const span = pointsSpans(wrapper)[0];
    expect(span.classes()).toContain("data-sheet__points--down");
    const badge = span.find(".data-sheet__points-delta");
    expect(badge.text()).toContain("▼");
    expect(badge.text()).toContain("10");
  });

  it("shows no badge for a datasheet absent from the previous MFM", async () => {
    setupDeltaStores();
    const wrapper = mount(DataSheet, {
      props: { dataSheet: curSheet("TRIARCH STALKER") },
    });
    await nextTick();
    const span = pointsSpans(wrapper)[0];
    expect(span.classes()).not.toContain("data-sheet__points--up");
    expect(span.find(".data-sheet__points-delta").exists()).toBe(false);
  });

  it("shows no highlight when the toggle is off", async () => {
    setupDeltaStores({ showPointsChanges: false });
    const wrapper = mount(DataSheet, {
      props: { dataSheet: curSheet("NECRON WARRIORS") },
    });
    await nextTick();
    const span = pointsSpans(wrapper)[0];
    expect(span.classes()).not.toContain("data-sheet__points--up");
    expect(span.find(".data-sheet__points-delta").exists()).toBe(false);
  });
});
