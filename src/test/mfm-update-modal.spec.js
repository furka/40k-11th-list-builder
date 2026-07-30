import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

import MfmUpdateModal from "../components/MfmUpdateModal.vue";
import { useArmyListStore } from "../stores/armyList";
import { useMfmStore } from "../stores/mfm";

const FACTION = "NECRONS";

// jsdom doesn't implement <dialog>.showModal()/close(); stub them so the
// component's close-after-update path doesn't throw.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

function sheet(name, models, points) {
  return {
    name,
    faction: FACTION,
    sizes: [
      {
        name: `${models} model${models === 1 ? "" : "s"}`,
        models,
        basePoints: points,
        tiers: [{ minCount: 1, points }],
      },
    ],
  };
}

const LIST_MFM = {
  MFM_VERSION: "V1.0",
  FACTIONS: [{ name: FACTION, detachments: [] }],
  DATA_SHEETS: [sheet("NECRON WARRIORS", 10, 80), sheet("CHRONOMANCER", 1, 80)],
};

const CUR_MFM = {
  MFM_VERSION: "V1.1",
  FACTIONS: [{ name: FACTION, detachments: [] }],
  DATA_SHEETS: [sheet("NECRON WARRIORS", 10, 100), sheet("CHRONOMANCER", 1, 70)],
};

const STUB_CHANGES = [
  {
    name: "NECRON WARRIORS",
    optionName: "10 models",
    models: 10,
    old: 80,
    new: 100,
    difference: 20,
  },
  {
    name: "CHRONOMANCER",
    optionName: "1 model",
    models: 1,
    old: 80,
    new: 70,
    difference: -10,
  },
];

function setupStores({ invalid = false, changes = STUB_CHANGES } = {}) {
  setActivePinia(createPinia());
  const mfm = useMfmStore();
  mfm.MFM = {
    CURRENT: CUR_MFM,
    PREVIOUS: LIST_MFM,
    [CUR_MFM.MFM_VERSION]: CUR_MFM,
    [LIST_MFM.MFM_VERSION]: LIST_MFM,
  };
  // getVersion / changes / hasInvalidMFM close over the loaded manual, so stub
  // them to the test versions.
  mfm.getVersion = (v) =>
    v === CUR_MFM.MFM_VERSION
      ? CUR_MFM
      : v === LIST_MFM.MFM_VERSION
        ? LIST_MFM
        : null;
  mfm.hasInvalidMFM = () => invalid;
  mfm.changes = () => changes;

  const army = useArmyListStore();
  army.setList({
    faction: FACTION,
    mfm_version: LIST_MFM.MFM_VERSION,
    maxPoints: 2000,
    detachments: [],
    units: [
      { id: "a", name: "NECRON WARRIORS", optionName: "10 models", models: 10 },
      { id: "b", name: "CHRONOMANCER", optionName: "1 model", models: 1 },
    ],
  });
  return { mfm, army };
}

describe("MfmUpdateModal.vue", () => {
  beforeEach(() => localStorage.clear());

  it("lists each changed unit with old→new and a signed delta", async () => {
    setupStores();
    const wrapper = mount(MfmUpdateModal);
    await nextTick();

    const rows = wrapper.findAll(".mfm-update__row");
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("NECRON WARRIORS");
    expect(rows[0].text()).toContain("80");
    expect(rows[0].text()).toContain("100");
    expect(rows[0].find(".mfm-update__delta--up").exists()).toBe(true);
    expect(rows[1].find(".mfm-update__delta--down").exists()).toBe(true);
  });

  it("shows the list total before and after", async () => {
    setupStores();
    const wrapper = mount(MfmUpdateModal);
    await nextTick();
    const total = wrapper.find(".mfm-update__total").text();
    expect(total).toContain("160"); // 80 + 80
    expect(total).toContain("170"); // 100 + 70
  });

  it("header names both versions", async () => {
    setupStores();
    const wrapper = mount(MfmUpdateModal);
    await nextTick();
    const title = wrapper.find(".mfm-update__title").text();
    expect(title).toContain("v1.0");
    expect(title).toContain("v1.1");
  });

  it("clicking Update sets the list to the current MFM version", async () => {
    const { army } = setupStores();
    const wrapper = mount(MfmUpdateModal);
    await nextTick();
    expect(army.mfm_version).toBe("V1.0");
    await wrapper.find(".mfm-update__button").trigger("click");
    expect(army.mfm_version).toBe("V1.1");
  });

  it("falls back to a note (not a diff) when the stored version is unknown", async () => {
    setupStores({ invalid: true, changes: [] });
    const wrapper = mount(MfmUpdateModal);
    await nextTick();
    expect(wrapper.find(".mfm-update__note").exists()).toBe(true);
    expect(wrapper.findAll(".mfm-update__row")).toHaveLength(0);
    // Update button still applies.
    await wrapper.find(".mfm-update__button").trigger("click");
    expect(useArmyListStore().mfm_version).toBe("V1.1");
  });
});
