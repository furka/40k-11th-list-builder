import { describe, it, expect, vi } from "vitest";
import { ref, defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { useDetectOutsideClick } from "../utils/click-outside";

function makeHost(callback) {
  return defineComponent({
    setup() {
      const rootRef = ref(null);
      useDetectOutsideClick(rootRef, callback);
      return () =>
        h("div", { ref: rootRef, class: "host" }, [
          h("span", { class: "inner" }, "inside"),
        ]);
    },
  });
}

describe("useDetectOutsideClick", () => {
  it("fires the callback when the click target is outside the component", () => {
    const cb = vi.fn();
    const wrapper = mount(makeHost(cb), { attachTo: document.body });

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.click();

    expect(cb).toHaveBeenCalledTimes(1);

    outside.remove();
    wrapper.unmount();
  });

  it("does NOT fire the callback when the click is on a descendant of the component", () => {
    const cb = vi.fn();
    const wrapper = mount(makeHost(cb), { attachTo: document.body });

    wrapper.find(".inner").element.click();

    expect(cb).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("stops listening after the component is unmounted", () => {
    const cb = vi.fn();
    const wrapper = mount(makeHost(cb), { attachTo: document.body });
    wrapper.unmount();

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.click();

    expect(cb).not.toHaveBeenCalled();
    outside.remove();
  });

  it("is a no-op when called with no component ref", () => {
    expect(() => useDetectOutsideClick(null, vi.fn())).not.toThrow();
  });

  it("tolerates a non-function callback (does not throw on outside click)", () => {
    const Host = defineComponent({
      setup() {
        const rootRef = ref(null);
        useDetectOutsideClick(rootRef, "not-a-function");
        return () => h("div", { ref: rootRef });
      },
    });
    const wrapper = mount(Host, { attachTo: document.body });

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    expect(() => outside.click()).not.toThrow();

    outside.remove();
    wrapper.unmount();
  });
});
