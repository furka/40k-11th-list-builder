import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, ref, computed, nextTick } from "vue";

import { useDetachmentSlotEl } from "../composables/useDetachmentSlotEl";
import { useDetachmentDragStore } from "../stores/detachmentDrag";

const BIN_RECT = { left: 500, right: 700, top: 0, bottom: 1000 };

const probe = (keyGetter) =>
  defineComponent({
    setup() {
      const elRef = ref(null);
      useDetachmentSlotEl(elRef, keyGetter);
      return () =>
        h("div", {
          ref: (el) => {
            if (el) el.getBoundingClientRect = () => BIN_RECT;
            elRef.value = el;
          },
        });
    },
  });

function startDraggingIntoBin(drag) {
  drag.start({
    name: "ALPHA",
    fromIndex: 0,
    pointer: { x: 600, y: 500 }, // inside BIN_RECT
  });
}

describe("useDetachmentSlotEl", () => {
  let drag;
  beforeEach(() => {
    setActivePinia(createPinia());
    drag = useDetachmentDragStore();
  });

  it("registers the bin element so the drag store hit-tests it", async () => {
    const keyGetter = () => (drag.draggedName ? "bin" : null);
    const wrapper = mount(probe(keyGetter));
    await nextTick();

    startDraggingIntoBin(drag);
    await nextTick();

    expect(drag.activeSlot?.type).toBe("bin");
    wrapper.unmount();
  });

  it("unregisters when the key flips to null", async () => {
    const enabled = ref(true);
    const keyGetter = computed(() => (enabled.value ? "bin" : null));
    const wrapper = mount(probe(() => keyGetter.value));
    await nextTick();

    startDraggingIntoBin(drag);
    await nextTick();
    expect(drag.activeSlot?.type).toBe("bin");

    enabled.value = false;
    await nextTick();
    drag.updatePointer(600, 500);
    expect(drag.activeSlot).toBeNull();

    wrapper.unmount();
  });

  it("unregisters on unmount", async () => {
    const wrapper = mount(probe(() => "bin"));
    await nextTick();

    startDraggingIntoBin(drag);
    await nextTick();
    expect(drag.activeSlot?.type).toBe("bin");

    wrapper.unmount();
    drag.updatePointer(600, 500);
    expect(drag.activeSlot).toBeNull();
  });
});
