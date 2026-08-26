import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

import VersionBar from "../components/VersionBar.vue";
import { useAppStore } from "../stores/app";
import { useArmyListStore } from "../stores/armyList";
import { useCodexStore } from "../stores/codex";
import { useMfmStore } from "../stores/mfm";

const FACTION = "NECRONS";

function mfmVersion(version) {
  return {
    MFM_VERSION: version,
    FACTIONS: [{ name: FACTION, detachments: [] }],
    DATA_SHEETS: [],
  };
}

const V1_0 = mfmVersion("V1.0");
const V1_1 = mfmVersion("V1.1");
const V1_2 = mfmVersion("V1.2");
const VERSIONS = { "V1.0": V1_0, "V1.1": V1_1, "V1.2": V1_2 };

function setupStores() {
  setActivePinia(createPinia());

  const mfm = useMfmStore();
  mfm.MFM = { ...VERSIONS, CURRENT: V1_2, PREVIOUS: V1_1 };
  // getPreviousMFM closes over the real loaded manual, so reassigning MFM above
  // doesn't reach it — restate mfm.js's ordering over the test versions.
  mfm.getPreviousMFM = (current) => {
    if (!current) return null;
    const keys = Object.keys(VERSIONS).sort();
    const idx = keys.indexOf(current.MFM_VERSION);
    return idx > 0 ? VERSIONS[keys[idx - 1]] : null;
  };
  // Keeps MfmUpdateModal (and its <dialog>, unimplemented in jsdom) unmounted.
  mfm.isListOutdated = () => false;

  const army = useArmyListStore();
  army.setList({
    faction: FACTION,
    mfm_version: V1_2.MFM_VERSION,
    maxPoints: 2000,
    detachments: [],
    units: [],
  });

  return { mfm, army, app: useAppStore(), codex: useCodexStore() };
}

describe("VersionBar.vue points-changes toggle", () => {
  beforeEach(() => localStorage.clear());

  it("renders the toggle when the displayed MFM has a predecessor", async () => {
    const { codex } = setupStores();
    codex.setCurrentMFM(V1_2);

    const wrapper = mount(VersionBar);
    await nextTick();

    expect(wrapper.find(".toggle-switch").exists()).toBe(true);
  });

  it("hides the toggle when the displayed MFM is the oldest version", async () => {
    const { codex } = setupStores();
    codex.setCurrentMFM(V1_0);

    const wrapper = mount(VersionBar);
    await nextTick();

    expect(wrapper.find(".toggle-switch").exists()).toBe(false);
  });

  it("falls back to the latest MFM when the codex has none pinned", async () => {
    setupStores();

    const wrapper = mount(VersionBar);
    await nextTick();

    expect(wrapper.find(".toggle-switch").exists()).toBe(true);
  });

  it("flips showPointsChanges and tracks it in the label", async () => {
    const { app, codex } = setupStores();
    codex.setCurrentMFM(V1_2);

    const wrapper = mount(VersionBar);
    await nextTick();

    expect(app.showPointsChanges).toBe(false);
    expect(wrapper.find(".toggle-switch").text()).toContain(
      "Points Changes Hidden"
    );

    await wrapper.find(".toggle-switch input").setValue(true);
    await nextTick();

    expect(app.showPointsChanges).toBe(true);
    expect(wrapper.find(".toggle-switch").text()).toContain(
      "Points Changes Visible"
    );
  });
});
