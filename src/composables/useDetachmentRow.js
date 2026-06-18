import { watch, onUnmounted, unref } from "vue";
import { useDetachmentDragStore } from "../stores/detachmentDrag";

/**
 * Register an army-list-detachment row with the detachment drag store while
 * a drag is in flight. Mirrors useRowEl but keyed by detachment name instead
 * of unit id. The store's hit-test reads the rect on each pointer move.
 */
export function useDetachmentRow(elRef, nameGetter) {
  const dragStore = useDetachmentDragStore();
  let lastName = null;

  const stop = watch(
    [elRef, nameGetter, () => dragStore.draggedName],
    ([el, name, dragging]) => {
      const resolvedEl = unref(el);
      if (lastName !== null && (lastName !== name || !dragging || !resolvedEl)) {
        dragStore.unregisterRow(lastName);
        lastName = null;
      }
      if (dragging && name && resolvedEl) {
        dragStore.registerRow(name, resolvedEl);
        lastName = name;
      }
    },
    { immediate: true, flush: "post" }
  );

  onUnmounted(() => {
    if (lastName) dragStore.unregisterRow(lastName);
    stop();
  });
}
