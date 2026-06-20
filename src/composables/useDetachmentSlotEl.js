import { watch, onUnmounted, unref } from "vue";
import { useDetachmentDragStore } from "../stores/detachmentDrag";

/**
 * Parallel to useSlotEl, but binds to the detachment drag store. Used by the
 * codex panel to publish itself as the "bin" drop target while a detachment
 * drag is in flight.
 */
export function useDetachmentSlotEl(elRef, keyGetter) {
  const dragStore = useDetachmentDragStore();
  let lastKey = null;

  const stop = watch(
    [elRef, keyGetter],
    ([el, key]) => {
      const resolvedEl = unref(el);
      if (lastKey !== null && lastKey !== key) {
        dragStore.unregisterSlotEl(lastKey);
        lastKey = null;
      }
      if (key && resolvedEl) {
        dragStore.registerSlotEl(key, resolvedEl);
        lastKey = key;
      }
    },
    { immediate: true, flush: "post" }
  );

  onUnmounted(() => {
    if (lastKey) dragStore.unregisterSlotEl(lastKey);
    stop();
  });
}
