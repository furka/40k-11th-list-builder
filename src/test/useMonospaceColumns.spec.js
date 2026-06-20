import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref, nextTick } from "vue";

import { useMonospaceColumns } from "../composables/useMonospaceColumns";

// jsdom doesn't ship ResizeObserver. Provide a no-op so the composable can
// instantiate one without crashing — the tests drive the measurement
// synchronously (via the initial measure() call) rather than waiting on a
// resize event, so we don't need to call the observer callback.
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

function makeProbe({ clientWidth, probeWidth }) {
  return defineComponent({
    setup(_, { expose }) {
      const elRef = ref(null);
      const cols = useMonospaceColumns(elRef);
      expose({ cols, elRef });
      return () =>
        h("div", {
          ref: (el) => {
            if (el) {
              Object.defineProperty(el, "clientWidth", {
                configurable: true,
                get() {
                  return clientWidth;
                },
              });
              const origAppend = el.appendChild.bind(el);
              el.appendChild = (child) => {
                child.getBoundingClientRect = () => ({ width: probeWidth });
                return origAppend(child);
              };
            }
            elRef.value = el;
          },
        });
    },
  });
}

describe("useMonospaceColumns", () => {
  it("starts at 0", () => {
    const wrapper = mount(
      defineComponent({
        setup(_, { expose }) {
          const elRef = ref(null);
          const cols = useMonospaceColumns(elRef);
          expose({ cols });
          return () => h("div");
        },
      })
    );
    expect(wrapper.vm.cols).toBe(0);
    wrapper.unmount();
  });

  it("reports floor(clientWidth / probeWidth) once the element is in the DOM", async () => {
    // 80 / 8 = 10 columns
    const wrapper = mount(makeProbe({ clientWidth: 80, probeWidth: 8 }), {
      attachTo: document.body,
    });
    await nextTick();
    expect(wrapper.vm.cols).toBe(10);
    wrapper.unmount();
  });

  it("floors a non-integer result (96 / 8.3 → 11)", async () => {
    const wrapper = mount(makeProbe({ clientWidth: 96, probeWidth: 8.3 }), {
      attachTo: document.body,
    });
    await nextTick();
    expect(wrapper.vm.cols).toBe(11);
    wrapper.unmount();
  });

  it("returns 0 when the probe reports 0 width (avoids divide-by-zero)", async () => {
    const wrapper = mount(makeProbe({ clientWidth: 80, probeWidth: 0 }), {
      attachTo: document.body,
    });
    await nextTick();
    expect(wrapper.vm.cols).toBe(0);
    wrapper.unmount();
  });
});
