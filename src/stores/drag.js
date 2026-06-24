import { defineStore } from "pinia";
import { computed, ref } from "vue";
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
  // True while a bypass modifier (Ctrl / Cmd) is held during the drag. ORed
  // with the persisted `freeAttach` pref to relax attachment restrictions for
  // this one drag. Tracked reactively so legality recomputes live as the key is
  // pressed/released mid-drag.
  const bypassKey = ref(false);
  // Set of host unit IDs that the dragged unit could legally attach to.
  // Consumed by ArmyListUnit to dim non-target rows during the drag, making
  // the attach affordance visually obvious without changing drop behavior.
  const attachHostIds = computed(() => {
    const out = new Set();
    for (const slot of legalSlots.value) {
      if (slot.type === "attach") out.add(slot.hostId);
    }
    return out;
  });
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
  // Row baseline (e.g. "22px") inherited from `.army-list-pane`'s
  // `--row-baseline`. Snapshotted at drag start and re-applied as an inline
  // style on the off-tree DragGhost so its rows match the live list. Stored
  // as a CSS-length string because it goes straight into a custom property.
  const rowBaseline = ref("22px");

  // DOM elements are intentionally not reactive — they're identity refs whose
  // rects we read at drag start (and re-capture on scroll/resize/register
  // events). Rect caching avoids forcing N layout reflows per pointermove.
  const slotEls = new Map();
  const rows = new Map(); // unitId -> { el, parentKey, indexInParent }

  // Inputs to legalDropSlots captured at drag start, retained so a mid-drag
  // bypass-key change can recompute legality without re-snapshotting the list.
  let dragInputs = null;

  let rowRectCache = new Map(); // unitId -> DOMRect
  let slotRectCache = new Map(); // slotKey -> DOMRect
  let rectsValid = false;

  function captureRects() {
    rowRectCache = new Map();
    for (const [unitId, info] of rows) {
      if (unitId === draggedId.value) continue;
      rowRectCache.set(unitId, info.el.getBoundingClientRect());
    }
    slotRectCache = new Map();
    for (const [key, el] of slotEls) {
      slotRectCache.set(key, el.getBoundingClientRect());
    }
    rectsValid = true;
  }
  function invalidateRects() {
    rectsValid = false;
  }

  function start({
    unit,
    pointer: ptr,
    units,
    getDataSheet,
    grabOffset,
    size,
    scale: scaleArg,
    rowBaseline: rowBaselineArg,
    enhancementMeta = null,
    freeAttach = false,
    bypass = false,
  }) {
    if (!unit?.id) return;
    draggedId.value = unit.id;
    bypassKey.value = bypass;
    dragInputs = { units, getDataSheet, enhancementMeta, freeAttach };
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
    rowBaseline.value = rowBaselineArg || "22px";
    legalSlots.value = legalDropSlots(
      units,
      unit.id,
      getDataSheet,
      enhancementMeta,
      freeAttach || bypass
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
    rectsValid = false;
    if (typeof window !== "undefined") {
      window.addEventListener("scroll", invalidateRects, {
        capture: true,
        passive: true,
      });
      window.addEventListener("resize", invalidateRects, { passive: true });
    }
    activeSlot.value = computeActiveSlot();
  }

  function updatePointer(x, y) {
    if (!draggedId.value) return;
    pointer.value = { x, y };
    activeSlot.value = computeActiveSlot();
  }

  // Toggle the bypass modifier mid-drag (Ctrl/Cmd pressed or released). Recomputes
  // the legal drop slots — and therefore the active slot — against the new
  // effective bypass state. No-op when the state is unchanged or no drag is live.
  function setBypass(on) {
    const next = Boolean(on);
    if (bypassKey.value === next) return;
    bypassKey.value = next;
    if (!draggedId.value || !dragInputs) return;
    legalSlots.value = legalDropSlots(
      dragInputs.units,
      draggedId.value,
      dragInputs.getDataSheet,
      dragInputs.enhancementMeta,
      dragInputs.freeAttach || next
    );
    activeSlot.value = computeActiveSlot();
  }

  function registerSlotEl(key, el) {
    if (el) slotEls.set(key, el);
    else slotEls.delete(key);
    rectsValid = false;
    if (draggedId.value) activeSlot.value = computeActiveSlot();
  }

  function unregisterSlotEl(key) {
    slotEls.delete(key);
    rectsValid = false;
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
    rectsValid = false;
    if (draggedId.value) activeSlot.value = computeActiveSlot();
  }

  function unregisterRow(unitId) {
    rows.delete(unitId);
    rectsValid = false;
    if (draggedId.value) activeSlot.value = computeActiveSlot();
  }

  function commit() {
    if (!draggedId.value || !activeSlot.value) {
      cancel();
      return null;
    }
    const descriptor = {
      ...activeSlot.value,
      draggedId: draggedId.value,
      // Effective bypass at drop time — drives the persisted `forcedAttach`
      // flag so an override made via the held key sticks like a toggled one.
      forced: Boolean(dragInputs?.freeAttach || bypassKey.value),
    };
    cancel();
    return descriptor;
  }

  function cancel() {
    draggedId.value = null;
    activeSlot.value = null;
    bypassKey.value = false;
    dragInputs = null;
    legalSlots.value = [];
    ghost.value = null;
    ghostSubtree.value = [];
    draggedSubtreeIds.value = new Set();
    pointer.value = { x: 0, y: 0 };
    ghostOffset.value = { x: 0, y: 0 };
    ghostSize.value = { width: 0, height: 0 };
    scale.value = 1;
    rowBaseline.value = "22px";
    slotEls.clear();
    rows.clear();
    rowRectCache.clear();
    slotRectCache.clear();
    rectsValid = false;
    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", invalidateRects, { capture: true });
      window.removeEventListener("resize", invalidateRects);
    }
  }

  function computeActiveSlot() {
    if (!rectsValid) captureRects();
    const rowsArray = [];
    for (const [unitId, info] of rows) {
      if (unitId === draggedId.value) continue;
      const rect = rowRectCache.get(unitId);
      rowsArray.push({ unitId, ...info, rect });
    }
    return pickActiveSlot({
      legalSlots: legalSlots.value,
      getRect: (key) => slotRectCache.get(key) ?? null,
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
    attachHostIds,
    activeSlot,
    ghost,
    ghostSubtree,
    draggedSubtreeIds,
    scale,
    rowBaseline,
    start,
    updatePointer,
    setBypass,
    registerSlotEl,
    unregisterSlotEl,
    registerRow,
    unregisterRow,
    commit,
    cancel,
  };
});
