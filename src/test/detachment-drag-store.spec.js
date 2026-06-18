import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDetachmentDragStore } from "../stores/detachmentDrag";

const fakeEl = (rect) => ({ getBoundingClientRect: () => rect });

function rect(top, bottom, left = 0, right = 200) {
  return { top, bottom, left, right };
}

describe("detachment drag store", () => {
  let drag;
  beforeEach(() => {
    setActivePinia(createPinia());
    drag = useDetachmentDragStore();
  });

  describe("start", () => {
    it("snapshots draggedName, fromIndex, ghost data, and grab geometry", () => {
      drag.start({
        name: "HEXWARP THRALLBAND",
        fromIndex: 1,
        pointer: { x: 30, y: 40 },
        grabOffset: { x: 5, y: 10 },
        size: { width: 200, height: 24 },
        dp: 1,
        role: { name: "Assault", color: "#abcdef" },
      });

      expect(drag.draggedName).toBe("HEXWARP THRALLBAND");
      expect(drag.fromIndex).toBe(1);
      expect(drag.ghostOffset).toEqual({ x: 5, y: 10 });
      expect(drag.ghostSize).toEqual({ width: 200, height: 24 });
      expect(drag.ghost).toMatchObject({
        name: "HEXWARP THRALLBAND",
        dp: 1,
        role: { name: "Assault", color: "#abcdef" },
      });
    });

    it("is a no-op when name is missing", () => {
      drag.start({ name: null, fromIndex: 0, pointer: { x: 0, y: 0 } });
      expect(drag.draggedName).toBe(null);
    });
  });

  describe("updatePointer hit-test", () => {
    // Dragging A (fromIndex=0) so "above A" and "below A" both move; this
    // keeps the test focused on hit-test geometry rather than no-op masking.
    beforeEach(() => {
      drag.start({
        name: "A",
        fromIndex: 0,
        pointer: { x: 0, y: 0 },
        grabOffset: { x: 0, y: 0 },
        size: { width: 200, height: 24 },
      });
      drag.registerRow("A", fakeEl(rect(100, 124)));
      drag.registerRow("B", fakeEl(rect(124, 148)));
      drag.registerRow("C", fakeEl(rect(148, 172)));
    });

    it("inserts at 0 when pointer is above the first row", () => {
      drag.updatePointer(50, 50);
      expect(drag.insertIndex).toBe(0);
      // No-op for fromIndex=0 → anchor suppressed (separately tested below).
    });

    it("inserts past the end when pointer is below the last row", () => {
      drag.updatePointer(50, 300);
      expect(drag.insertIndex).toBe(3);
      expect(drag.insertAnchorRect).toMatchObject({
        edge: "bottom",
        bottom: 172,
      });
    });

    it("inserts above a row when pointer is in its top half", () => {
      // Row B spans 124-148, midline 136. Point at y=128 → before B → index 1.
      drag.updatePointer(50, 128);
      expect(drag.insertIndex).toBe(1);
    });

    it("inserts below a row when pointer is in its bottom half", () => {
      // Row B's midline is 136. Point at y=144 → past B's midline → index 2.
      drag.updatePointer(50, 144);
      expect(drag.insertIndex).toBe(2);
      expect(drag.insertAnchorRect).toMatchObject({ edge: "top", top: 148 });
    });

    it("resolves the 2px CSS gap between rows cleanly", () => {
      // Simulate a layout with 2px gaps: A=100-122, B=124-146, C=148-170.
      // y=123 falls in the gap between A and B — no row rect contains it,
      // but the midline partitioning still gives a sensible answer.
      drag.registerRow("A", fakeEl(rect(100, 122)));
      drag.registerRow("B", fakeEl(rect(124, 146)));
      drag.registerRow("C", fakeEl(rect(148, 170)));
      drag.updatePointer(50, 123);
      // A.midline=111, B.midline=135 — y=123 is past A.midline, below
      // B.midline → insert before B → index 1.
      expect(drag.insertIndex).toBe(1);
    });

    it("uses visual order (sorted by rect.top), not Map insertion order", () => {
      // Simulate post-reorder state: rows registered in mount order A,B,C
      // but visually re-ordered to C(100-124), A(124-148), B(148-172).
      // (registerRow is called when draggedName goes non-null, in component
      // mount order — useDetachmentRow's watcher doesn't re-fire on Vue's
      // post-reorder DOM move.)
      drag.registerRow("A", fakeEl(rect(124, 148)));
      drag.registerRow("B", fakeEl(rect(148, 172)));
      drag.registerRow("C", fakeEl(rect(100, 124)));
      // Pointer near top of column → should land at visual index 0 (above C).
      drag.updatePointer(50, 105);
      expect(drag.insertIndex).toBe(0);
    });
  });

  describe("no-op anchor suppression", () => {
    beforeEach(() => {
      drag.start({
        name: "B",
        fromIndex: 1,
        pointer: { x: 0, y: 0 },
        grabOffset: { x: 0, y: 0 },
        size: { width: 200, height: 24 },
      });
      drag.registerRow("A", fakeEl(rect(100, 124)));
      drag.registerRow("B", fakeEl(rect(124, 148)));
      drag.registerRow("C", fakeEl(rect(148, 172)));
    });

    it("suppresses the anchor when dropping at fromIndex (no movement)", () => {
      // y=130 → past A.midline (112), below B.midline (136) → insertIndex=1.
      drag.updatePointer(50, 130);
      expect(drag.insertIndex).toBe(1);
      expect(drag.insertAnchorRect).toBe(null);
    });

    it("suppresses the anchor when dropping at fromIndex+1 (no movement)", () => {
      // y=145 → past B.midline (136), below C.midline (160) → insertIndex=2.
      drag.updatePointer(50, 145);
      expect(drag.insertIndex).toBe(2);
      expect(drag.insertAnchorRect).toBe(null);
    });

    it("shows the anchor when the drop would actually move the item", () => {
      drag.updatePointer(50, 105); // above A → insertIndex=0, real move.
      expect(drag.insertIndex).toBe(0);
      expect(drag.insertAnchorRect).not.toBe(null);
    });
  });

  describe("commit", () => {
    beforeEach(() => {
      drag.start({
        name: "B",
        fromIndex: 1,
        pointer: { x: 0, y: 0 },
        grabOffset: { x: 0, y: 0 },
        size: { width: 200, height: 24 },
      });
      drag.registerRow("A", fakeEl(rect(100, 124)));
      drag.registerRow("B", fakeEl(rect(124, 148)));
      drag.registerRow("C", fakeEl(rect(148, 172)));
    });

    it("returns null when dropping at the same position (insertIndex === fromIndex)", () => {
      // Pointer inside row B's top half → insertIndex = 1 = fromIndex.
      drag.updatePointer(50, 130);
      expect(drag.insertIndex).toBe(1);
      const result = drag.commit();
      expect(result).toBe(null);
    });

    it("returns null when dropping just past the source (insertIndex === fromIndex + 1)", () => {
      // Pointer inside row B's bottom half → insertIndex = 2 = fromIndex + 1.
      drag.updatePointer(50, 145);
      expect(drag.insertIndex).toBe(2);
      const result = drag.commit();
      expect(result).toBe(null);
    });

    it("returns a reorder descriptor for a real move", () => {
      // Move B to position 0 (above A).
      drag.updatePointer(50, 105);
      const result = drag.commit();
      expect(result).toEqual({
        type: "detachment-reorder",
        draggedName: "B",
        fromIndex: 1,
        toIndex: 0,
      });
      // commit() resets state.
      expect(drag.draggedName).toBe(null);
    });

    it("returns a reorder descriptor when dropping past the end", () => {
      drag.updatePointer(50, 300);
      const result = drag.commit();
      expect(result).toEqual({
        type: "detachment-reorder",
        draggedName: "B",
        fromIndex: 1,
        toIndex: 3,
      });
    });
  });

  describe("cancel", () => {
    it("clears all state without returning a descriptor", () => {
      drag.start({
        name: "X",
        fromIndex: 0,
        pointer: { x: 1, y: 2 },
        grabOffset: { x: 3, y: 4 },
        size: { width: 5, height: 6 },
      });
      drag.registerRow("X", fakeEl(rect(0, 24)));
      drag.cancel();

      expect(drag.draggedName).toBe(null);
      expect(drag.insertIndex).toBe(null);
      expect(drag.insertAnchorRect).toBe(null);
      expect(drag.ghost).toBe(null);
    });
  });
});
