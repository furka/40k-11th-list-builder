import { watch, onUnmounted, unref } from "vue";
import { useDragStore } from "../stores/drag";

/**
 * Register a template ref with the drag store under a reactive slot key.
 *
 * Usage:
 *   const rowEl = ref(null);
 *   useSlotEl(rowEl, () => dragStore.draggedId ? `attach:${unit.id}` : null);
 *
 * The `keyGetter` returns either a slot key string (when the element should
 * participate in drag hit-testing) or `null` (when it should not). The
 * registration follows changes in both the element ref and the key so a
 * component that mounts/unmounts dynamic slot zones doesn't leak stale rects
 * into the drag store.
 */
export function useSlotEl(elRef, keyGetter) {
  const dragStore = useDragStore();
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
