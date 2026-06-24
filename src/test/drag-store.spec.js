import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDragStore } from "../stores/drag";

const SHEETS = {
  "NECRON WARRIORS": { name: "NECRON WARRIORS", keywords: ["BATTLELINE"] },
  IMOTEKH: {
    name: "IMOTEKH",
    keywords: ["CHARACTER"],
    leader: { attachesTo: ["NECRON WARRIORS"] },
  },
  Enhancements: { name: "Enhancements", enhancements: true },
};
const getDataSheet = (name) => SHEETS[name] ?? null;

const UNITS = [
  { id: "w", name: "NECRON WARRIORS", models: 10 },
  { id: "imo", name: "IMOTEKH" },
];

// Stub DOM element with a fixed rect.
const fakeEl = (rect) => ({ getBoundingClientRect: () => rect });
const ROW_RECT = { left: 0, right: 100, top: 100, bottom: 140 };

function startDraggingImo(drag, pointer = { x: 0, y: 0 }) {
  drag.start({
    unit: UNITS[1],
    pointer,
    units: UNITS,
    getDataSheet,
    grabOffset: { x: 10, y: 5 },
    size: { width: 200, height: 32 },
  });
}

describe("drag store", () => {
  let drag;
  beforeEach(() => {
    setActivePinia(createPinia());
    drag = useDragStore();
  });

  describe("start", () => {
    it("snapshots draggedId, ghost info, ghost size/offset, and legal slots", () => {
      const units = [
        { id: "w", name: "NECRON WARRIORS", models: 10 },
        { id: "imo", name: "IMOTEKH", optionName: "1 model", models: 1, points: 100 },
      ];
      drag.start({
        unit: units[1],
        pointer: { x: 50, y: 50 },
        units,
        getDataSheet,
        grabOffset: { x: 12, y: 8 },
        size: { width: 250, height: 32 },
      });

      expect(drag.draggedId).toBe("imo");
      expect(drag.ghost).toMatchObject({
        name: "IMOTEKH",
        optionName: "1 model",
        models: 1,
        points: 100,
      });
      expect(drag.ghostOffset).toEqual({ x: 12, y: 8 });
      expect(drag.ghostSize).toEqual({ width: 250, height: 32 });

      const types = drag.legalSlots.map((s) => s.type);
      expect(types).toContain("attach");
      expect(types).toContain("bin");
      expect(types).toContain("reorder");
    });

    it("captures the dragged unit's full subtree for the ghost", () => {
      const units = [
        { id: "w", name: "NECRON WARRIORS", models: 10 },
        { id: "imo", name: "IMOTEKH", attachedTo: "w" },
        { id: "enh", name: "Enhancements", optionName: "Veil", attachedTo: "imo" },
        { id: "ll", name: "NECRON WARRIORS" },
      ];
      drag.start({
        unit: units[0],
        pointer: { x: 0, y: 0 },
        units,
        getDataSheet,
      });

      // Subtree of warriors: warriors -> imotekh -> enhancement.
      expect(drag.ghostSubtree.map((r) => [r.unit.id, r.depth])).toEqual([
        ["w", 0],
        ["imo", 1],
        ["enh", 2],
      ]);
      expect(drag.draggedSubtreeIds.has("w")).toBe(true);
      expect(drag.draggedSubtreeIds.has("imo")).toBe(true);
      expect(drag.draggedSubtreeIds.has("enh")).toBe(true);
      expect(drag.draggedSubtreeIds.has("ll")).toBe(false);
    });

    it("is a no-op for a missing unit", () => {
      drag.start({ unit: null, pointer: { x: 0, y: 0 }, units: [], getDataSheet });
      expect(drag.draggedId).toBeNull();
      expect(drag.legalSlots).toEqual([]);
    });
  });

  describe("updatePointer + activeSlot (row-based hit-test)", () => {
    it("does nothing when idle", () => {
      drag.updatePointer(50, 50);
      expect(drag.activeSlot).toBeNull();
      expect(drag.pointer).toEqual({ x: 0, y: 0 });
    });

    it("recomputes activeSlot from registered rows", () => {
      startDraggingImo(drag);
      drag.registerRow("w", fakeEl(ROW_RECT), {
        parentKey: "root",
        indexInParent: 0,
      });
      drag.updatePointer(50, 120); // middle of the row
      expect(drag.activeSlot?.type).toBe("attach");
      expect(drag.activeSlot?.hostId).toBe("w");

      drag.updatePointer(50, 5000); // off any row
      expect(drag.activeSlot).toBeNull();
    });

    it("ignores the dragged unit's own registered row", () => {
      startDraggingImo(drag);
      // Even if Imotekh's row tries to register itself, the store filters it
      // out so the user can't drop onto their own source row.
      drag.registerRow("imo", fakeEl(ROW_RECT), {
        parentKey: "root",
        indexInParent: 0,
      });
      drag.updatePointer(50, 120);
      expect(drag.activeSlot).toBeNull();
    });

    it("routes a top-edge hit to the adjacent 'above' reorder slot", () => {
      startDraggingImo(drag);
      drag.registerRow("w", fakeEl(ROW_RECT), {
        parentKey: "root",
        indexInParent: 0,
      });
      // top 25% = y < 110
      drag.updatePointer(50, 105);
      expect(drag.activeSlot).toMatchObject({
        type: "reorder",
        parentId: null,
        index: 0,
        anchorEdge: "top",
      });
    });

    it("bin wins when pointer is over the bin element", () => {
      startDraggingImo(drag);
      drag.registerSlotEl(
        "bin",
        fakeEl({ left: 500, right: 700, top: 0, bottom: 1000 })
      );
      drag.updatePointer(600, 500);
      expect(drag.activeSlot).toEqual({ type: "bin", key: "bin" });
    });
  });

  describe("registerRow / unregisterRow", () => {
    it("registering with null removes the row", () => {
      startDraggingImo(drag, { x: 50, y: 120 });
      drag.registerRow("w", fakeEl(ROW_RECT), {
        parentKey: "root",
        indexInParent: 0,
      });
      expect(drag.activeSlot?.hostId).toBe("w");

      drag.registerRow("w", null);
      drag.updatePointer(50, 120);
      expect(drag.activeSlot).toBeNull();
    });

    it("unregisterRow removes the row", () => {
      startDraggingImo(drag, { x: 50, y: 120 });
      drag.registerRow("w", fakeEl(ROW_RECT), {
        parentKey: "root",
        indexInParent: 0,
      });
      drag.unregisterRow("w");
      drag.updatePointer(50, 120);
      expect(drag.activeSlot).toBeNull();
    });
  });

  describe("commit", () => {
    it("returns the activeSlot merged with draggedId and resets state", () => {
      startDraggingImo(drag, { x: 50, y: 120 });
      drag.registerRow("w", fakeEl(ROW_RECT), {
        parentKey: "root",
        indexInParent: 0,
      });
      drag.updatePointer(50, 120);

      const result = drag.commit();
      expect(result).toMatchObject({ type: "attach", hostId: "w", draggedId: "imo" });
      expect(drag.draggedId).toBeNull();
      expect(drag.activeSlot).toBeNull();
      expect(drag.legalSlots).toEqual([]);
    });

    it("returns null when there's no active slot and still resets state", () => {
      startDraggingImo(drag);
      const result = drag.commit();
      expect(result).toBeNull();
      expect(drag.draggedId).toBeNull();
    });
  });

  describe("bypass modifier", () => {
    const attachHosts = (d) =>
      d.legalSlots.filter((s) => s.type === "attach").map((s) => s.hostId);

    function startDraggingWarriors(d, { bypass = false, pointer = { x: 0, y: 0 } } = {}) {
      d.start({
        unit: UNITS[0], // NECRON WARRIORS — a regular unit, normally unattachable
        pointer,
        units: UNITS,
        getDataSheet,
        grabOffset: { x: 0, y: 0 },
        size: { width: 200, height: 32 },
        bypass,
      });
    }

    it("seeds bypass from start() so a regular unit can attach", () => {
      startDraggingWarriors(drag);
      expect(attachHosts(drag)).toEqual([]);
      drag.cancel();
      startDraggingWarriors(drag, { bypass: true });
      expect(attachHosts(drag)).toContain("imo");
    });

    it("recomputes legality live as the modifier toggles mid-drag", () => {
      startDraggingWarriors(drag);
      expect(attachHosts(drag)).toEqual([]);
      drag.setBypass(true);
      expect(attachHosts(drag)).toContain("imo");
      drag.setBypass(false);
      expect(attachHosts(drag)).toEqual([]);
    });

    it("commit carries forced=true when the bypass modifier is held", () => {
      startDraggingWarriors(drag, { pointer: { x: 50, y: 120 } });
      drag.setBypass(true);
      drag.registerRow("imo", fakeEl(ROW_RECT), {
        parentKey: "root",
        indexInParent: 0,
      });
      drag.updatePointer(50, 120);
      expect(drag.commit()).toMatchObject({
        type: "attach",
        hostId: "imo",
        forced: true,
      });
    });

    it("a normal (non-bypass) attach commits with forced=false", () => {
      startDraggingImo(drag, { x: 50, y: 120 });
      drag.registerRow("w", fakeEl(ROW_RECT), {
        parentKey: "root",
        indexInParent: 0,
      });
      drag.updatePointer(50, 120);
      expect(drag.commit()).toMatchObject({
        type: "attach",
        hostId: "w",
        forced: false,
      });
    });
  });

  describe("cancel", () => {
    it("clears all transient state including rows and ghost offsets", () => {
      startDraggingImo(drag, { x: 50, y: 120 });
      drag.registerRow("w", fakeEl(ROW_RECT), {
        parentKey: "root",
        indexInParent: 0,
      });
      drag.updatePointer(50, 120);

      drag.cancel();
      expect(drag.draggedId).toBeNull();
      expect(drag.activeSlot).toBeNull();
      expect(drag.legalSlots).toEqual([]);
      expect(drag.ghost).toBeNull();
      expect(drag.pointer).toEqual({ x: 0, y: 0 });
      expect(drag.ghostOffset).toEqual({ x: 0, y: 0 });
      expect(drag.ghostSize).toEqual({ width: 0, height: 0 });

      // Rows cleared too — re-registering after cancel works fresh.
      drag.updatePointer(50, 120);
      expect(drag.activeSlot).toBeNull();
    });
  });
});
