import { ref, watch } from "vue";

// How many monospace characters fit horizontally in `elRef`'s content box.
// Reports 0 until the element is in the DOM and visible; updates via
// ResizeObserver when the element resizes (including the 0 → non-zero
// transition when a containing <dialog> opens via showModal()).
export function useMonospaceColumns(elRef) {
  const cols = ref(0);

  watch(
    elRef,
    (el, _prev, onCleanup) => {
      if (!el) {
        cols.value = 0;
        return;
      }

      // Probe inherits the target's computed font so charWidth matches what
      // the rendered text actually uses, regardless of CSS cascade source.
      const probe = document.createElement("span");
      probe.textContent = "0";
      probe.style.cssText =
        "position:absolute;visibility:hidden;white-space:pre;pointer-events:none;";
      el.appendChild(probe);

      const measure = () => {
        const charW = probe.getBoundingClientRect().width;
        cols.value = charW > 0 ? Math.floor(el.clientWidth / charW) : 0;
      };

      const observer = new ResizeObserver(measure);
      observer.observe(el);
      measure();

      onCleanup(() => {
        observer.disconnect();
        probe.remove();
      });
    },
    { immediate: true }
  );

  return cols;
}
