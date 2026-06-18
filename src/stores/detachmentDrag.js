import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Drag coordinator for army-list detachments. Mirrors the unit drag store
 * pattern (stores/drag.js) but flatter: detachments are a single-level
 * ordered list, so the only legal drop is "insert at index N".
 *
 * Row registration: every rendered army-list-detachment publishes itself
 * while a drag is in flight (via useDetachmentRow). updatePointer walks the
 * registered rows in insertion order, midline-tests each rect against the
 * cursor, and records the resulting insertIndex + insertAnchorRect for the
 * drop overlay's insertion line.
 *
 * commit() returns either null (no-op: dropping where you started) or a
 * descriptor `{ type, draggedName, fromIndex, toIndex }`. A thin watcher in
 * App.vue dispatches the descriptor to armyListStore.setDetachments.
 */
export const useDetachmentDragStore = defineStore("detachmentDrag", () => {
  const draggedName = ref(null);
  const fromIndex = ref(0);
  const pointer = ref({ x: 0, y: 0 });
  const ghostOffset = ref({ x: 0, y: 0 });
  const ghostSize = ref({ width: 0, height: 0 });
  // Captured at drag start so the ghost can render the dragged detachment
  // without having to look it up against a separately-reactive source.
  const ghost = ref(null);
  const insertIndex = ref(null);
  const insertAnchorRect = ref(null);

  // DOM elements are intentionally non-reactive — identity refs whose rects
  // we re-read on each pointer move. Insertion order matches detachment list
  // order; a JS Map preserves insertion order.
  const rows = new Map(); // name -> el

  function start({ name, fromIndex: idx, pointer: ptr, grabOffset, size, dp, role }) {
    if (!name) return;
    draggedName.value = name;
    fromIndex.value = idx ?? 0;
    pointer.value = { x: ptr?.x ?? 0, y: ptr?.y ?? 0 };
    ghostOffset.value = { x: grabOffset?.x ?? 0, y: grabOffset?.y ?? 0 };
    ghostSize.value = { width: size?.width ?? 0, height: size?.height ?? 0 };
    ghost.value = { name, dp: dp ?? 0, role: role ?? null };
    recomputeInsert();
  }

  function updatePointer(x, y) {
    if (!draggedName.value) return;
    pointer.value = { x, y };
    recomputeInsert();
  }

  function registerRow(name, el) {
    if (el) rows.set(name, el);
    else rows.delete(name);
    if (draggedName.value) recomputeInsert();
  }

  function unregisterRow(name) {
    rows.delete(name);
    if (draggedName.value) recomputeInsert();
  }

  function commit() {
    if (!draggedName.value || insertIndex.value === null) {
      cancel();
      return null;
    }
    // Dropping at fromIndex or fromIndex+1 doesn't move the item.
    const from = fromIndex.value;
    const to = insertIndex.value;
    if (to === from || to === from + 1) {
      cancel();
      return null;
    }
    const descriptor = {
      type: "detachment-reorder",
      draggedName: draggedName.value,
      fromIndex: from,
      toIndex: to,
    };
    cancel();
    return descriptor;
  }

  function cancel() {
    draggedName.value = null;
    fromIndex.value = 0;
    insertIndex.value = null;
    insertAnchorRect.value = null;
    pointer.value = { x: 0, y: 0 };
    ghostOffset.value = { x: 0, y: 0 };
    ghostSize.value = { width: 0, height: 0 };
    ghost.value = null;
    rows.clear();
  }

  function recomputeInsert() {
    const entries = [...rows.entries()].map(([name, el]) => ({
      name,
      rect: el.getBoundingClientRect(),
    }));
    if (entries.length === 0) {
      insertIndex.value = null;
      insertAnchorRect.value = null;
      return;
    }
    // Sort by visual position. The Map preserves mount order, which diverges
    // from visual order after a reorder — Vue keeps component instances stable
    // (`:key="name"`) and useDetachmentRow's watcher never re-fires, so the
    // Map iteration index no longer matches the current detachment-list index.
    entries.sort((a, b) => a.rect.top - b.rect.top);

    const y = pointer.value.y;

    // Each row's midline partitions the column. Pointer above row i's midline
    // (and below i-1's midline) → insert before row i. This naturally absorbs
    // the 2px CSS gaps between rows — there's no "in-between" dead zone.
    let target = null;
    for (let i = 0; i < entries.length; i++) {
      const r = entries[i].rect;
      if (y < (r.top + r.bottom) / 2) {
        target = { index: i, rect: r, edge: "top" };
        break;
      }
    }
    if (!target) {
      const last = entries[entries.length - 1];
      target = { index: entries.length, rect: last.rect, edge: "bottom" };
    }

    insertIndex.value = target.index;
    // Suppress the insertion line when the drop would leave the order
    // unchanged — drawing a "move here" affordance that doesn't actually
    // move anything is misleading. commit() still returns null in both cases.
    const isNoOp =
      target.index === fromIndex.value || target.index === fromIndex.value + 1;
    insertAnchorRect.value = isNoOp
      ? null
      : { ...rectFor(target.rect), edge: target.edge };
  }

  function rectFor(r) {
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }

  return {
    draggedName,
    fromIndex,
    pointer,
    ghostOffset,
    ghostSize,
    ghost,
    insertIndex,
    insertAnchorRect,
    start,
    updatePointer,
    registerRow,
    unregisterRow,
    commit,
    cancel,
  };
});
