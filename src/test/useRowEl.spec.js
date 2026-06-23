import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, ref, nextTick } from "vue";

import { useRowEl } from "../composables/useRowEl";
import { useDragStore } from "../stores/drag";

const SHEETS = {
  "NECRON WARRIORS": { name: "NECRON WARRIORS", keywords: ["BATTLELINE"] },
  IMOTEKH: { name: "IMOTEKH", leader: { attachesTo: ["NECRON WARRIORS"] } },
};
const getDataSheet = (n) => SHEETS[n] ?? null;
const UNITS = [
  { id: "w", name: "NECRON WARRIORS", models: 10 },
  { id: "imo", name: "IMOTEKH" },
];

const ROW_RECT = { left: 0, right: 100, top: 100, bottom: 140 };
const probe = (unitIdGetter, metaGetter) =>
  defineComponent({
    setup() {
      const elRef = ref(null);
      useRowEl(elRef, unitIdGetter, metaGetter);
      return () =>
        h("div", {
          ref: (el) => {
            if (el) el.getBoundingClientRect = () => ROW_RECT;
            elRef.value = el;
          },
        });
    },
  });

function startDraggingImo(drag) {
  drag.start({
    unit: UNITS[1],
    pointer: { x: 0, y: 0 },
    units: UNITS,
    getDataSheet,
  });
}

describe("useRowEl", () => {
  let drag;
  beforeEach(() => {
    setActivePinia(createPinia());
    drag = useDragStore();
  });

  it("registers the row with metadata once a drag starts", async () => {
    const wrapper = mount(
      probe(
        () => "w",
        () => ({ parentKey: "root", indexInParent: 0 })
      )
    );
    await nextTick();

    startDraggingImo(drag);
    await nextTick();

    drag.updatePointer(50, 120); // middle of the row → attach
    expect(drag.activeSlot?.type).toBe("attach");
    expect(drag.activeSlot?.hostId).toBe("w");

    wrapper.unmount();
  });

  it("doesn't register before a drag starts (no idle work)", async () => {
    const wrapper = mount(
      probe(
        () => "w",
        () => ({ parentKey: "root", indexInParent: 0 })
      )
    );
    await nextTick();

    // No drag yet — hit-test should return null even though the el exists.
    drag.updatePointer(50, 120);
    expect(drag.activeSlot).toBeNull();

    wrapper.unmount();
  });

  it("filters out the dragged unit's own row at the store level", async () => {
    // Even if a row registers itself as `imo` while imo is being dragged,
    // the store excludes it from hit-test so the user can't drop on the
    // source row.
    const wrapper = mount(
      probe(
        () => "imo",
        () => ({ parentKey: "root", indexInParent: 0 })
      )
    );
    await nextTick();

    startDraggingImo(drag);
    await nextTick();

    drag.updatePointer(50, 120);
    expect(drag.activeSlot).toBeNull();

    wrapper.unmount();
  });

  it("unregisters on unmount", async () => {
    const wrapper = mount(
      probe(
        () => "w",
        () => ({ parentKey: "root", indexInParent: 0 })
      )
    );
    await nextTick();
    startDraggingImo(drag);
    await nextTick();
    drag.updatePointer(50, 120);
    expect(drag.activeSlot?.type).toBe("attach");

    wrapper.unmount();
    drag.updatePointer(50, 120);
    expect(drag.activeSlot).toBeNull();
  });
});
