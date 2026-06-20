import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAppStore } from "../stores/app";
import { useArmyListStore } from "../stores/armyList";
import { useMfmStore } from "../stores/mfm";
import { SORT_MANUAL } from "../data/constants";

const TEST_MFM = {
  EDITION: "11th",
  MFM_VERSION: "V1.0 (test)",
  FACTIONS: [
    { name: "NECRONS", detachments: [{ name: "AWAKENED DYNASTY", dp: 1, enhancements: [] }] },
    { name: "AELDARI", detachments: [{ name: "WINDRIDERS", dp: 1, enhancements: [] }] },
  ],
  DATA_SHEETS: [],
};

function setup() {
  setActivePinia(createPinia());
  const mfm = useMfmStore();
  mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
  return { app: useAppStore(), army: useArmyListStore() };
}

describe("app store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("setAppDimensions", () => {
    it("updates appHeight and appWidth", () => {
      const { app } = setup();
      app.setAppDimensions(900, 1600);
      expect(app.appHeight).toBe(900);
      expect(app.appWidth).toBe(1600);
    });
  });

  describe("createNewList", () => {
    it("uses the provided faction when given one", () => {
      const { app } = setup();
      const list = app.createNewList("AELDARI");
      expect(list.faction).toBe("AELDARI");
      expect(list.mfm_version).toBe(TEST_MFM.MFM_VERSION);
      expect(list.maxPoints).toBe(2000);
      expect(list.units).toEqual([]);
      expect(list.detachments).toEqual([]);
      expect(list.sortOrder).toBe(SORT_MANUAL);
    });

    it("falls back to the first faction in MFM.CURRENT.FACTIONS when none is provided", () => {
      const { app } = setup();
      expect(app.createNewList().faction).toBe("NECRONS");
    });

    it("falls back to empty string when MFM.CURRENT is missing", () => {
      setActivePinia(createPinia());
      const mfm = useMfmStore();
      mfm.MFM = { CURRENT: null };
      const app = useAppStore();
      const list = app.createNewList();
      expect(list.faction).toBe("");
      expect(list.mfm_version).toBe("");
    });
  });

  describe("newList", () => {
    it("does NOT push to saved lists when the current army has no faction yet", () => {
      const { app } = setup();
      expect(app.lists).toEqual([]);
      app.newList("AELDARI");
      expect(app.lists).toEqual([]);
    });

    it("pushes the current army to saved lists when one was loaded, then sets the new one", () => {
      const { app, army } = setup();
      army.setList({
        faction: "NECRONS",
        mfm_version: TEST_MFM.MFM_VERSION,
        units: [],
        detachments: [],
      });
      app.newList("AELDARI");
      expect(app.lists.length).toBe(1);
      expect(app.lists[0].faction).toBe("NECRONS");
      expect(army.faction).toBe("AELDARI");
    });
  });

  describe("selectList", () => {
    it("moves the selected list out of `lists` and into the army store", () => {
      const { app, army } = setup();
      army.setList({
        faction: "NECRONS",
        mfm_version: TEST_MFM.MFM_VERSION,
        units: [],
        detachments: [],
      });
      const target = {
        faction: "AELDARI",
        mfm_version: TEST_MFM.MFM_VERSION,
        units: [],
        detachments: [],
      };
      app.lists.push(target);
      app.selectList(target);
      expect(app.lists).not.toContain(target);
      expect(army.faction).toBe("AELDARI");
      // The previously-loaded NECRONS list got pushed to the front of `lists`.
      expect(app.lists[0].faction).toBe("NECRONS");
    });
  });

  describe("copyList", () => {
    it("inserts a deep clone of the list at the same index", () => {
      const { app } = setup();
      const orig = {
        faction: "NECRONS",
        units: [{ name: "Warriors", models: 10 }],
      };
      app.lists.push({ faction: "AELDARI" }, orig, { faction: "TSONS" });
      app.copyList(orig);
      expect(app.lists.length).toBe(4);
      const clone = app.lists[1];
      expect(clone).not.toBe(orig);
      expect(clone).toEqual(orig);
      // Mutating the clone does not touch the original.
      clone.units[0].models = 99;
      expect(orig.units[0].models).toBe(10);
    });

    it("clones the current army when given an object that JSON-matches it", () => {
      const { app, army } = setup();
      army.setList({
        faction: "NECRONS",
        mfm_version: TEST_MFM.MFM_VERSION,
        units: [],
        detachments: [],
      });
      const snapshot = army.toObject();
      app.copyList(snapshot);
      // Clone landed at index 0 of the lists array.
      expect(app.lists.length).toBe(1);
      expect(app.lists[0].faction).toBe("NECRONS");
      expect(app.lists[0]).not.toBe(snapshot);
    });
  });

  describe("deleteList", () => {
    it("removes the list from `lists`", () => {
      const { app } = setup();
      const target = { faction: "AELDARI" };
      app.lists.push({ faction: "NECRONS" }, target, { faction: "TSONS" });
      app.deleteList(target);
      expect(app.lists.map((l) => l.faction)).toEqual(["NECRONS", "TSONS"]);
    });
  });
});
