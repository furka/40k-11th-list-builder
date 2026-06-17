import { defineStore } from "pinia";
import { ref } from "vue";
import { legalDropSlots, pickActiveSlot } from "../utils/legal-drop-slots";

/**
 * Drag coordinator. Holds ALL transient drag state — what's being dragged,
 * where the cursor is, the full enumerated set of legal drop slots (frozen at
 * drag start), and which slot the cursor currently lands on.
 *
 * Two registration channels:
 *  - `registerRow(unitId, el, meta)` — every rendered list row publishes
 *    itself while a drag is in flight. Hit-test uses row geometry to derive
 *    both attach (middle 50%) and reorder (top/bottom 25% edges) slots, with
 *    no inline gap elements that would cause layout shift on drag start.
 *  - `registerSlotEl(key, el)` — used only for the `bin` slot (the codex
 *    panel registers itself this way).
 *
 * `commit()` returns a descriptor of the resolved drop and resets state.
 * The caller (a thin wire-up in App.vue) dispatches the descriptor to
 * `armyListStore.moveUnit` / `removeUnit`. Keeping the dispatch out of this
 * store leaves it free of cross-store coupling and trivial to unit-test.
 */
export const useDragStore = defineStore("drag", () => {
  const draggedId = ref(null);
  const pointer = ref({ x: 0, y: 0 });
  const ghostOffset = ref({ x: 0, y: 0 });
  const ghostSize = ref({ width: 0, height: 0 });
  const legalSlots = ref([]);
  const activeSlot = ref(null);
  const ghost = ref(null);
  // The dragged unit's full subtree, flattened to render order. Each entry
  // is `{ unit, depth }` — the ghost passes the unit straight to a readonly
  // ArmyListUnit instance so the ghost rows visually match the live list.
  const ghostSubtree = ref([]);
  const draggedSubtreeIds = ref(new Set());
  // The army list's current scale (points → row height). Captured at drag
  // start so the ghost can render rows at the same heights as the live list.
  const scale = ref(1);

  // DOM elements are intentionally not reactive — they're identity refs whose
  // rects we re-read each pointer move.
  const slotEls = new Map();
  const rows = new Map(); // unitId -> { el, parentKey, indexInParent }

  function start({
    unit,
    pointer: ptr,
    units,
    getDataSheet,
    grabOffset,
    size,
    scale: scaleArg,
    enhancementMeta = null,
  }) {
    if (!unit?.id) return;
    draggedId.value = unit.id;
    pointer.value = { x: ptr?.x ?? 0, y: ptr?.y ?? 0 };
    ghostOffset.value = {
      x: grabOffset?.x ?? 0,
      y: grabOffset?.y ?? 0,
    };
    ghostSize.value = {
      width: size?.width ?? 0,
      height: size?.height ?? 0,
    };
    scale.value = scaleArg ?? 1;
    legalSlots.value = legalDropSlots(
      units,
      unit.id,
      getDataSheet,
      enhancementMeta
    );
    ghost.value = {
      name: unit.name,
      optionName: unit.optionName,
      models: unit.models,
      points: unit.points,
      parentDataSheet: unit.parentDataSheet,
    };
    const flat = [];
    const ids = new Set();
    (function walk(u, depth) {
      flat.push({ unit: u, depth });
      ids.add(u.id);
      for (const c of units) {
        if (c.attachedTo === u.id) walk(c, depth + 1);
      }
    })(unit, 0);
    ghostSubtree.value = flat;
    draggedSubtreeIds.value = ids;
    activeSlot.value = computeActiveSlot();
  }

  function updatePointer(x, y) {
    if (!draggedId.value) return;
    pointer.value = { x, y };
    activeSlot.value = computeActiveSlot();
  }

  function registerSlotEl(key, el) {
    if (el) slotEls.set(key, el);
    else slotEls.delete(key);
    if (draggedId.value) activeSlot.value = computeActiveSlot();
  }

  function unregisterSlotEl(key) {
    slotEls.delete(key);
    if (draggedId.value) activeSlot.value = computeActiveSlot();
  }

  function registerRow(unitId, el, meta) {
    if (el) {
      rows.set(unitId, {
        el,
        parentKey: meta?.parentKey ?? "root",
        indexInParent: meta?.indexInParent ?? 0,
      });
    } else {
      rows.delete(unitId);
    }
    if (draggedId.value) activeSlot.value = computeActiveSlot();
  }

  function unregisterRow(unitId) {
    rows.delete(unitId);
    if (draggedId.value) activeSlot.value = computeActiveSlot();
  }

  function commit() {
    if (!draggedId.value || !activeSlot.value) {
      cancel();
      return null;
    }
    const descriptor = { ...activeSlot.value, draggedId: draggedId.value };
    cancel();
    return descriptor;
  }

  function cancel() {
    draggedId.value = null;
    activeSlot.value = null;
    legalSlots.value = [];
    ghost.value = null;
    ghostSubtree.value = [];
    draggedSubtreeIds.value = new Set();
    pointer.value = { x: 0, y: 0 };
    ghostOffset.value = { x: 0, y: 0 };
    ghostSize.value = { width: 0, height: 0 };
    scale.value = 1;
    slotEls.clear();
    rows.clear();
  }

  function computeActiveSlot() {
    const rowsArray = [];
    for (const [unitId, info] of rows) {
      if (unitId === draggedId.value) continue;
      rowsArray.push({ unitId, ...info });
    }
    return pickActiveSlot({
      legalSlots: legalSlots.value,
      getRect: (key) => slotEls.get(key)?.getBoundingClientRect() ?? null,
      rows: rowsArray,
      pointer: pointer.value,
    });
  }

  return {
    draggedId,
    pointer,
    ghostOffset,
    ghostSize,
    legalSlots,
    activeSlot,
    ghost,
    ghostSubtree,
    draggedSubtreeIds,
    scale,
    start,
    updatePointer,
    registerSlotEl,
    unregisterSlotEl,
    registerRow,
    unregisterRow,
    commit,
    cancel,
  };
});
