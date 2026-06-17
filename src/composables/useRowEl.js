import { watch, onUnmounted, unref } from "vue";
import { useDragStore } from "../stores/drag";

/**
 * Register a row's DOM element + parent metadata with the drag store while a
 * drag is in flight. The store filters out the dragged unit's own row so
 * you can't drop onto your source row.
 *
 * Usage:
 *   const rowEl = ref(null);
 *   useRowEl(rowEl, () => props.unit.id, () => ({
 *     parentKey: props.parentKey,
 *     indexInParent: props.indexInParent,
 *   }));
 *
 * Re-registers whenever the element, unit id, or metadata changes. Unregisters
 * on key→null, on unmount, and whenever the drag ends.
 */
export function useRowEl(elRef, unitIdGetter, metaGetter) {
  const dragStore = useDragStore();
  let lastUnitId = null;

  const stop = watch(
    [elRef, unitIdGetter, metaGetter, () => dragStore.draggedId],
    ([el, unitId, meta, dragging]) => {
      const resolvedEl = unref(el);
      if (lastUnitId !== null && (lastUnitId !== unitId || !dragging || !resolvedEl)) {
        dragStore.unregisterRow(lastUnitId);
        lastUnitId = null;
      }
      if (dragging && unitId && resolvedEl) {
        dragStore.registerRow(unitId, resolvedEl, meta ?? {});
        lastUnitId = unitId;
      }
    },
    { immediate: true, flush: "post" }
  );

  onUnmounted(() => {
    if (lastUnitId) dragStore.unregisterRow(lastUnitId);
    stop();
  });
}
