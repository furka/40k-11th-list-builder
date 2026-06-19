<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import RiskIcon from "../assets/risk-icon.svg";
import { nameEquals } from "../utils/name-match";
import { useArmyListStore } from "../stores/armyList";
import { useCodexStore } from "../stores/codex";
import { useDragStore } from "../stores/drag";
import { scaledHeightPx } from "../utils/unit-sizing";
import { useRowEl } from "../composables/useRowEl";

const armyListStore = useArmyListStore();
const codexStore = useCodexStore();
const dragStore = useDragStore();

const props = defineProps({
  unit: Object,
  scale: Number,
  // `parentKey` is "root" or a host unit's id — used by the drag store to
  // route edge-hit reorder slots. `indexInParent` is this row's position
  // among its parent's dragged-excluded siblings.
  parentKey: { type: String, default: "root" },
  indexInParent: { type: Number, default: 0 },
  // When true, this row is being rendered inside the DragGhost. Skips the
  // drag-store row registration, the pointerdown drag-start handler, and
  // the source-row dimming — the ghost is the "lifted off" rendering, not a
  // live drop target.
  readonly: { type: Boolean, default: false },
});

const rowEl = ref(null);

// Register this row with the drag store while a drag is in flight. The store
// filters out the dragged unit's own row so users can't drop on themselves.
useRowEl(
  rowEl,
  () => (props.readonly ? null : props.unit.id),
  () => ({
    parentKey: props.parentKey,
    indexInParent: props.indexInParent,
  })
);

const isAttachTarget = computed(() => {
  const slot = dragStore.activeSlot;
  return slot?.type === "attach" && slot.hostId === props.unit.id;
});

// True for the dragged unit AND any of its attached descendants — the whole
// subtree dims together so the user sees what's "going with" the host. The
// ghost copy renders the same rows but with `readonly` so it stays visible.
const isDragging = computed(
  () => !props.readonly && dragStore.draggedSubtreeIds.has(props.unit.id)
);

// `dragInFlight` is true for every row while ANY drag is happening. We use it
// to suppress the row's normal :hover style — otherwise dragging a unit over
// a different row paints two competing highlights (hover + attach-target),
// and dragging past a non-target row still triggers the hover background.
const dragInFlight = computed(() => dragStore.draggedId !== null);

const breakdown = computed(
  () => armyListStore.pointsBreakdown.perUnit[props.unit.id] ?? null
);

const unitPoints = computed(() => {
  const p = breakdown.value?.points ?? 0;
  return p > 0 ? p : 0;
});

const tierLabel = computed(() => breakdown.value?.tierLabel ?? null);

// Show a small "Upgrade" badge on enhancement rows whose metadata flags them
// as non-character-only (i.e. the source name had a trailing "(Upgrade)"
// suffix). Returns false for non-enhancement units.
const isUnitUpgrade = computed(() => {
  if (props.unit.name !== "Enhancements") return false;
  return Boolean(armyListStore.getEnhancementMeta(props.unit)?.nonCharacterOnly);
});

// Just the points-proportional portion of the row; the row's `flex-basis`
// composes this with the inherited `--row-baseline` CSS variable.
const scaledHeight = computed(() => scaledHeightPx(unitPoints.value, props.scale));

const name = computed(() => {
  let name = "";

  if (props.unit.models) {
    name += `(${props.unit.models}) `;
  }

  if (nameEquals(props.unit.name, "Enhancements")) {
    name += `[Enh] ${props.unit.optionName}`;
  } else if (nameEquals(props.unit.name, "Wargear")) {
    name += `[Wgr] ${props.unit.optionName}`;
  } else if (props.unit.optionName) {
    name += `${props.unit.name} — ${props.unit.optionName}`;
  } else {
    name += props.unit.name;
  }

  return name;
});

// Dynamic font scaling for the name span. When the full name would overflow
// the row's available width at 14px, walk the size down 1px at a time until
// it fits or we hit the 10px floor. Past that floor, `text-overflow: ellipsis`
// in the scoped CSS handles the truncation cleanly. The chosen size flows out
// via `nameFontSize` + a `v-bind` in the scoped style.
const nameRef = ref(null);
const nameFontSize = ref("14px");

const fitName = () => {
  const el = nameRef.value;
  if (!el) return;
  const MAX = 14;
  const MIN = 10;
  // Set fontSize imperatively during measurement so each iteration's
  // scrollWidth read reflects that exact size. Clear it on the next frame
  // so `v-bind("nameFontSize")` becomes the source of truth again — without
  // the clear, later refits would be masked by the lingering inline style.
  el.style.fontSize = `${MAX}px`;
  let size = MAX;
  while (el.scrollWidth > el.clientWidth && size > MIN) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
  nameFontSize.value = `${size}px`;
  requestAnimationFrame(() => {
    if (el) el.style.fontSize = "";
  });
};

let nameResizeObserver = null;
onMounted(() => {
  fitName();
  // jsdom (used by the test environment) doesn't define ResizeObserver, and
  // there's no useful resize signal there anyway — the guard keeps the unit
  // tests rendering without polyfilling.
  if (nameRef.value && typeof ResizeObserver !== "undefined") {
    nameResizeObserver = new ResizeObserver(fitName);
    nameResizeObserver.observe(nameRef.value);
  }
});
onBeforeUnmount(() => {
  nameResizeObserver?.disconnect();
  nameResizeObserver = null;
});

watch(name, fitName, { flush: "post" });

const inValid = computed(() => {
  return armyListStore.getUnitValidationError(props.unit);
});

function onPointerDown(e) {
  if (props.readonly) return;
  // Left mouse / primary touch only; skip nested interactive elements.
  if (e.button !== undefined && e.button !== 0) return;
  if (e.target.closest("a, button")) return;

  e.preventDefault();
  const rect = e.currentTarget.getBoundingClientRect();
  // Enhancements need their metadata for drop-slot legality (upgrade →
  // non-character; plain → character; optional allowedHosts whitelist).
  // Other unit types ignore enhancementMeta.
  const enhancementMeta =
    props.unit.name === "Enhancements"
      ? armyListStore.getEnhancementMeta(props.unit)
      : null;
  // Snapshot the inherited row baseline so the off-tree DragGhost renders
  // rows at the same height as the live list (which inherits the variable
  // from `.army-list-pane`). Falls back to MIN_ROW_PX if the var isn't set.
  const inheritedBaseline = getComputedStyle(e.currentTarget)
    .getPropertyValue("--row-baseline")
    .trim();
  dragStore.start({
    unit: props.unit,
    pointer: { x: e.clientX, y: e.clientY },
    units: armyListStore.units,
    getDataSheet: (name) => codexStore.getDataSheet(name),
    grabOffset: {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    },
    size: { width: rect.width, height: rect.height },
    scale: props.scale,
    rowBaseline: inheritedBaseline || "22px",
    enhancementMeta,
  });
}
</script>

<template>
  <div
    ref="rowEl"
    class="army-list-unit"
    :data-id="props.unit.id"
    :title="name"
    :class="{
      error: inValid,
      'army-list-unit--attach-target': isAttachTarget,
      'army-list-unit--dragging': isDragging,
      'army-list-unit--drag-mode': dragInFlight,
    }"
    @pointerdown="onPointerDown"
  >
    <span class="army-list-unit__warning" :title="inValid" v-if="inValid">
      <RiskIcon class="army-list-unit__warning-icon" />
    </span>
    <span ref="nameRef" class="army-list-unit__name">
      {{ name }}
    </span>
    <span
      v-if="isUnitUpgrade"
      class="army-list-unit__upgrade-badge"
      title="Unit upgrade — attaches to a non-character unit"
    >UPGRADE</span>
    <span v-if="tierLabel" class="army-list-unit__tier">
      ({{ tierLabel }})
    </span>
    <span class="army-list-unit__points" v-if="unitPoints > 0">
      {{ unitPoints }} pts
    </span>
  </div>
</template>

<style scoped lang="scss">
.army-list-unit {
  align-items: center;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
  box-sizing: border-box;
  cursor: grab;
  display: flex;
  flex-basis: calc(var(--row-baseline, 22px) + v-bind("scaledHeight"));
  flex-shrink: 0;
  justify-content: space-between;
  // Override the default `min-height: auto` (= min-content of the row's
  // text) so flex-basis is authoritative. Without this, dense lists force
  // every row up to ~22px regardless of the adaptive baseline, and the
  // accumulated overflow gets clipped at the top of `.army-list` — making
  // the topmost unit appear to slide under the detachments header. The
  // companion `overflow: hidden` keeps text from bleeding into the 1px
  // gap between rows when the baseline drops below the natural line-height.
  min-height: 0;
  overflow: hidden;
  position: relative;
  // touch-action: none keeps a touch-drag on this row from being interpreted
  // as page-scroll by the browser. Required for mobile DnD via Pointer Events.
  touch-action: none;
  user-select: none;
  z-index: 1;

  &:active {
    cursor: grabbing;
  }

  &.error {
    background-color: #3a1418;
  }

  // Gate hover on :not(--drag-mode) so dragging over rows doesn't paint a
  // hover background that competes with the attach-target highlight (or
  // shows a "this row would react" affordance over rows that can't take a
  // drop). When idle, hover behaves as before.
  &:not(.army-list-unit--drag-mode):hover {
    background-color: var(--color-header);
    z-index: 2;
  }

  &--attach-target {
    // Visible "drop here to attach" affordance while an attachable unit is
    // being dragged over this row.
    background-color: var(--color-accent-dim);
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
    z-index: 3;
  }

  &--dragging {
    // Source row goes fully transparent so the unit feels physically lifted
    // out of the list — the row still occupies its space (no reflow), but
    // the ghost is the only visible copy. The wrapping ArmyListUnitNode also
    // sets this on itself so the grouping stripe (::before) fades too.
    opacity: 0;
  }

  &__name {
    color: var(--color-text);
    font-family: var(--font-display);
    // `nameFontSize` is set by the per-row measurement loop — 14px when the
    // name fits cleanly, shrinking 1px at a time down to 10px before falling
    // back to ellipsis truncation.
    font-size: v-bind("nameFontSize");
    font-weight: 600;
    letter-spacing: 0.3px;
    overflow: hidden;
    padding: 0 6px;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;

    &:hover {
      background-color: inherit;
      overflow: initial;
    }
  }

  &__points {
    color: var(--color-accent);
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 600;
    margin-left: auto;
    padding: 0 6px;
    text-align: center;
    white-space: nowrap;
  }

  &__tier {
    color: var(--color-text-muted);
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  &__warning {
    color: var(--color-negative);
    cursor: help;
    padding: 4px;
    position: absolute;

    &-icon {
      height: 24px;
      width: 24px;
    }
  }

  &__warning + &__name {
    margin-inline-start: 32px;
  }

  // Matches Games Workshop's own visual language — bright green pill, full
  // "UPGRADE" word in uppercase white. Same look in the codex enhancement
  // list (CodexDetachmentCard.vue) so the cue reads consistently across panels.
  &__upgrade-badge {
    align-items: center;
    background-color: var(--color-positive);
    border-radius: 3px;
    color: #fff;
    cursor: help;
    display: inline-flex;
    flex-shrink: 0;
    font-family: var(--font-display);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.8px;
    margin: 0 4px;
    padding: 1px 5px;
    text-transform: uppercase;
  }
}
</style>
