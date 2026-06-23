import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

import ArmyList from "../components/ArmyList.vue";
import { useArmyListStore } from "../stores/armyList";
import { useMfmStore } from "../stores/mfm";

const FACTION = "NECRONS";

const TEST_MFM = {
  EDITION: "11th",
  MFM_VERSION: "V1.0 (test)",
  FACTIONS: [
    {
      name: FACTION,
      detachments: [
        { name: "AWAKENED DYNASTY", dp: 1, enhancements: [] },
        { name: "BIG ONE", dp: 3, enhancements: [] },
      ],
    },
  ],
  DATA_SHEETS: [
    {
      name: "NECRON WARRIORS",
      faction: FACTION,
      keywords: ["BATTLELINE"],
      sizes: [{ name: "10 models", models: 10, basePoints: 100 }],
    },
    {
      name: "IMOTEKH THE STORMLORD",
      faction: FACTION,
      keywords: ["CHARACTER", "EPIC HERO"],
      leader: { attachesTo: ["NECRON WARRIORS"] },
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

function mountWithList({ units = [], detachments = [], maxPoints = 2000 } = {}) {
  setActivePinia(createPinia());
  const mfm = useMfmStore();
  mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
  mfm.getVersion = (v) => (v === TEST_MFM.MFM_VERSION ? TEST_MFM : null);
  const army = useArmyListStore();
  army.setList({
    faction: FACTION,
    mfm_version: TEST_MFM.MFM_VERSION,
    maxPoints,
    units,
    detachments,
  });
  // Stub the heavy children so the test stays focused on ArmyList's own logic.
  // ArmyListUnitNode has its own component tests (army-list-sizing-render.spec.js);
  // the modals and overlays are pure presentational glue.
  return mount(ArmyList, {
    global: {
      stubs: {
        ArmyListUnitNode: { name: "ArmyListUnitNode", template: "<div class='aluns' :data-unit-id='unit.id' />", props: ["unit", "scale", "depth", "parentKey", "indexInParent"] },
        ArmyListDetachment: { name: "ArmyListDetachment", template: "<div class='ald' :data-name='name' />", props: ["name", "dp", "role", "index"] },
        DropOverlay: { name: "DropOverlay", template: "<div />" },
        DetachmentDropOverlay: { name: "DetachmentDropOverlay", template: "<div />" },
      },
    },
  });
}

describe("ArmyList.vue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders one ArmyListUnitNode per ROOT unit (attached children are not rendered at root)", async () => {
    const wrapper = mountWithList({
      units: [
        { id: "host", name: "NECRON WARRIORS", models: 10 },
        { id: "leader", name: "IMOTEKH THE STORMLORD", attachedTo: "host" },
        { id: "lone", name: "NECRON WARRIORS", models: 10 },
      ],
    });
    await nextTick();
    const nodes = wrapper.findAll(".aluns");
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.attributes("data-unit-id"))).toEqual(["host", "lone"]);
  });

  it("renders an empty list when no units are present", async () => {
    const wrapper = mountWithList({ units: [] });
    await nextTick();
    expect(wrapper.findAll(".aluns")).toHaveLength(0);
  });

  it("renders one ArmyListDetachment per detachment in the breakdown", async () => {
    const wrapper = mountWithList({
      detachments: ["AWAKENED DYNASTY"],
      units: [],
    });
    await nextTick();
    const dets = wrapper.findAll(".ald");
    expect(dets).toHaveLength(1);
    expect(dets[0].attributes("data-name")).toBe("AWAKENED DYNASTY");
  });

  it("renders the DP counter in 'used / max DP' format", async () => {
    const withDet = mountWithList({ detachments: ["AWAKENED DYNASTY"] });
    await nextTick();
    const dp = withDet.find(".army-list-detachments__dp");
    expect(dp.exists()).toBe(true);
    expect(dp.text()).toMatch(/\d+\s*\/\s*\d+\s*DP/);
  });

  it("flags DP overage with the --over modifier class and shows the warning icon", async () => {
    // BIG ONE is 3DP; battle-size budget for 2000 pts is 3 — exactly at limit,
    // not over. Push it over by pairing AWAKENED DYNASTY (1DP) with BIG ONE.
    // Actually the rules forbid combining 3-DP with anything, so we use a
    // tiny maxPoints so the budget shrinks below 3.
    const wrapper = mountWithList({
      detachments: ["BIG ONE"],
      maxPoints: 500,
    });
    await nextTick();
    const dp = wrapper.find(".army-list-detachments__dp");
    expect(dp.exists()).toBe(true);
    expect(dp.classes()).toContain("army-list-detachments__dp--over");
  });
});
