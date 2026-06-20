import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, ref, nextTick } from "vue";

import { useDetachmentRow } from "../composables/useDetachmentRow";
import { useDetachmentDragStore } from "../stores/detachmentDrag";

const ROW_RECT = { left: 0, right: 200, top: 100, bottom: 140 };

const probe = (nameGetter) =>
  defineComponent({
    setup() {
      const elRef = ref(null);
      useDetachmentRow(elRef, nameGetter);
      return () =>
        h("div", {
          ref: (el) => {
            if (el) el.getBoundingClientRect = () => ROW_RECT;
            elRef.value = el;
          },
        });
    },
  });

function startDraggingX(drag) {
  drag.start({
    name: "X-DETACHMENT",
    fromIndex: 0,
    pointer: { x: 0, y: 0 },
  });
}

describe("useDetachmentRow", () => {
  let drag;
  beforeEach(() => {
    setActivePinia(createPinia());
    drag = useDetachmentDragStore();
  });

  it("registers the row once a drag starts, so the store can resolve insertIndex", async () => {
    const wrapper = mount(probe(() => "ALPHA"));
    await nextTick();

    startDraggingX(drag);
    await nextTick();

    drag.updatePointer(50, 120); // inside ROW_RECT vertically
    expect(drag.insertIndex).not.toBeNull();

    wrapper.unmount();
  });

  it("does not register before a drag starts (no idle work)", async () => {
    const wrapper = mount(probe(() => "ALPHA"));
    await nextTick();

    drag.updatePointer(50, 120);
    expect(drag.insertIndex).toBeNull();

    wrapper.unmount();
  });

  it("unregisters on unmount", async () => {
    const wrapper = mount(probe(() => "ALPHA"));
    await nextTick();
    startDraggingX(drag);
    await nextTick();
    drag.updatePointer(50, 120);
    expect(drag.insertIndex).not.toBeNull();

    wrapper.unmount();
    drag.updatePointer(50, 120);
    expect(drag.insertIndex).toBeNull();
  });
});
