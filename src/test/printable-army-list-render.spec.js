import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

import PrintableArmyList from "../components/PrintableArmyList.vue";
import { useArmyListStore } from "../stores/armyList";
import { useMfmStore } from "../stores/mfm";

const FACTION = "NECRONS";
const ALLY_FACTION = "AELDARI";

const TEST_MFM = {
  EDITION: "11th",
  MFM_VERSION: "V1.0 (test)",
  FACTIONS: [
    {
      name: FACTION,
      detachments: [{ name: "AWAKENED DYNASTY", dp: 1, enhancements: [] }],
    },
    {
      name: ALLY_FACTION,
      detachments: [],
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
      keywords: ["CHARACTER"],
      leader: { attachesTo: ["NECRON WARRIORS"] },
      sizes: [{ name: "1 model", models: 1, basePoints: 100 }],
    },
    {
      name: "DOOMSDAY ARK",
      faction: FACTION,
      sizes: [{ name: "1 model", models: 1, basePoints: 200 }],
      wargearOptions: [{ name: "Doomsday gauss flayer", points: 10 }],
    },
    {
      name: "FARSEER",
      faction: ALLY_FACTION,
      keywords: ["CHARACTER"],
      sizes: [{ name: "1 model", models: 1, basePoints: 100 }],
    },
  ],
};

let savedRO;
beforeAll(() => {
  savedRO = global.ResizeObserver;
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});
afterAll(() => {
  global.ResizeObserver = savedRO;
});

function mountList({ name = "", units = [], detachments = [], allies = [] } = {}) {
  setActivePinia(createPinia());
  const mfm = useMfmStore();
  mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
  mfm.getVersion = (v) => (v === TEST_MFM.MFM_VERSION ? TEST_MFM : null);
  const army = useArmyListStore();
  army.setList({
    name,
    faction: FACTION,
    mfm_version: TEST_MFM.MFM_VERSION,
    maxPoints: 2000,
    units,
    detachments,
    allies,
  });
  return mount(PrintableArmyList);
}

describe("PrintableArmyList.vue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the faction + total points title line with dot padding", async () => {
    const wrapper = mountList({
      units: [
        {
          id: "a",
          name: "NECRON WARRIORS",
          optionName: "10 models",
          models: 10,
        },
      ],
    });
    await nextTick();
    const lis = wrapper.findAll("li");
    const title = lis.find((li) => li.text().includes(FACTION));
    expect(title).toBeDefined();
    expect(title.text()).toMatch(/^NECRONS\.+100 pts$/);
  });

  it("renders the optional list name as the first row when present", async () => {
    const wrapper = mountList({ name: "My Necrons" });
    await nextTick();
    const lis = wrapper.findAll("li");
    expect(lis[0].text()).toBe("My Necrons");
  });

  it("formats a regular unit as 'Name — option (models) ... pts'", async () => {
    const wrapper = mountList({
      units: [
        {
          id: "a",
          name: "NECRON WARRIORS",
          optionName: "10 models",
          models: 10,
        },
      ],
    });
    await nextTick();
    const unitLine = wrapper
      .findAll("li")
      .map((li) => li.text())
      .find((t) => t.includes("NECRON WARRIORS"));
    expect(unitLine).toMatch(/^NECRON WARRIORS — 10 models \(10\)\.+100 pts$/);
  });

  it("indents and branch-prefixes attached units (depth 1 → '└─ ')", async () => {
    const wrapper = mountList({
      units: [
        {
          id: "host",
          name: "NECRON WARRIORS",
          optionName: "10 models",
          models: 10,
        },
        {
          id: "ldr",
          name: "IMOTEKH",
          optionName: "1 model",
          models: 1,
          attachedTo: "host",
        },
      ],
    });
    await nextTick();
    const lines = wrapper.findAll("li").map((li) => li.text());
    const attached = lines.find((l) => l.includes("IMOTEKH"));
    expect(attached).toMatch(/^└─ IMOTEKH/);
  });

  it("formats Wargear by name with the host's wargearOption price", async () => {
    // Wargear pricing walks to the host's datasheet (list-points.js:60–66),
    // so the wargear must be attached to a unit whose MFM datasheet actually
    // carries the option — DOOMSDAY ARK here.
    const wrapper = mountList({
      units: [
        {
          id: "ark",
          name: "DOOMSDAY ARK",
          optionName: "1 model",
          models: 1,
        },
        {
          id: "wgr",
          name: "Wargear",
          parentDataSheet: "DOOMSDAY ARK",
          optionName: "Doomsday gauss flayer",
          attachedTo: "ark",
        },
      ],
    });
    await nextTick();
    const lines = wrapper.findAll("li").map((li) => li.text());
    expect(lines.some((l) => /Doomsday gauss flayer\.+10 pts/.test(l))).toBe(true);
  });

  it("renders each selected detachment with its DP cost", async () => {
    const wrapper = mountList({
      detachments: ["AWAKENED DYNASTY"],
      units: [],
    });
    await nextTick();
    const lines = wrapper.findAll("li").map((li) => li.text());
    expect(lines.some((l) => /AWAKENED DYNASTY\.+1DP$/.test(l))).toBe(true);
  });

  it("renders an 'ALLIES: <factions>' line when allied units are in the army", async () => {
    const wrapper = mountList({
      allies: [ALLY_FACTION],
      units: [
        {
          id: "f",
          name: "FARSEER",
          optionName: "1 model",
          models: 1,
          allied: true,
          alliedFaction: ALLY_FACTION,
        },
      ],
    });
    await nextTick();
    const lines = wrapper.findAll("li").map((li) => li.text());
    expect(lines.some((l) => l === `ALLIES: ${ALLY_FACTION}`)).toBe(true);
  });

  it("omits the ALLIES line when an ally is picked but contributes no units", async () => {
    const wrapper = mountList({
      allies: [ALLY_FACTION],
      units: [],
    });
    await nextTick();
    const lines = wrapper.findAll("li").map((li) => li.text());
    expect(lines.some((l) => l.startsWith("ALLIES:"))).toBe(false);
  });

  it("filters out units whose points lookup returns 0 (no matching MFM entry)", async () => {
    const wrapper = mountList({
      units: [
        {
          id: "ghost",
          name: "GHOST UNIT", // not in TEST_MFM → 0 points
          optionName: "1 model",
          models: 1,
        },
      ],
    });
    await nextTick();
    const lines = wrapper.findAll("li").map((li) => li.text());
    expect(lines.some((l) => l.includes("GHOST UNIT"))).toBe(false);
  });

  it("exposes a plainText copy of the same content via defineExpose", async () => {
    const wrapper = mountList({
      name: "My Necrons",
      detachments: ["AWAKENED DYNASTY"],
      units: [
        {
          id: "a",
          name: "NECRON WARRIORS",
          optionName: "10 models",
          models: 10,
        },
      ],
    });
    await nextTick();
    const text = wrapper.vm.plainText;
    expect(text).toContain("My Necrons");
    expect(text).toMatch(/NECRONS\.+100 pts/);
    expect(text).toMatch(/AWAKENED DYNASTY\.+1DP/);
    expect(text).toMatch(/NECRON WARRIORS — 10 models \(10\)\.+100 pts/);
  });
});
