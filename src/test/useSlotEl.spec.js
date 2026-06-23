import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, ref, computed, nextTick } from "vue";

import { useSlotEl } from "../composables/useSlotEl";
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

// The bin slot is the only slot still routed through registerSlotEl (rows go
// through registerRow). We use it to exercise the useSlotEl composable.
const BIN_RECT = { left: 500, right: 700, top: 0, bottom: 1000 };
const probe = (keyGetter) =>
  defineComponent({
    setup() {
      const elRef = ref(null);
      useSlotEl(elRef, keyGetter);
      return () => h("div", {
        ref: (el) => {
          if (el) el.getBoundingClientRect = () => BIN_RECT;
          elRef.value = el;
        },
        "data-probe": "1",
      });
    },
  });

function startDraggingImo(drag) {
  drag.start({
    unit: UNITS[1],
    pointer: { x: 600, y: 500 }, // inside BIN_RECT
    units: UNITS,
    getDataSheet,
  });
}

describe("useSlotEl", () => {
  let drag;
  beforeEach(() => {
    setActivePinia(createPinia());
    drag = useDragStore();
  });

  it("registers the element so the drag store hit-tests it", async () => {
    const keyGetter = () => (drag.draggedId ? "bin" : null);
    const wrapper = mount(probe(keyGetter));
    await nextTick();

    startDraggingImo(drag);
    await nextTick();

    expect(drag.activeSlot?.key).toBe("bin");
    wrapper.unmount();
  });

  it("unregisters when the key flips to null", async () => {
    const enabled = ref(true);
    const keyGetter = computed(() => (enabled.value ? "bin" : null));
    const wrapper = mount(probe(() => keyGetter.value));
    await nextTick();

    startDraggingImo(drag);
    await nextTick();
    expect(drag.activeSlot?.key).toBe("bin");

    enabled.value = false;
    await nextTick();
    drag.updatePointer(600, 500);
    expect(drag.activeSlot).toBeNull();

    wrapper.unmount();
  });

  it("unregisters on unmount", async () => {
    const keyGetter = () => "bin";
    const wrapper = mount(probe(keyGetter));
    await nextTick();

    startDraggingImo(drag);
    await nextTick();
    expect(drag.activeSlot?.key).toBe("bin");

    wrapper.unmount();
    drag.updatePointer(600, 500);
    expect(drag.activeSlot).toBeNull();
  });
});
