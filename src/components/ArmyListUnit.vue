<script setup>
import { computed, ref } from "vue";
import RiskIcon from "../assets/risk-icon.svg";
import { nameEquals } from "../utils/name-match";
import { useArmyListStore } from "../stores/armyList";
import { useCodexStore } from "../stores/codex";
import { useDragStore } from "../stores/drag";
import { unitHeightPx } from "../utils/unit-sizing";
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
// as unit-upgrade (i.e. the source name had a trailing "(Upgrade)" suffix).
// The flag lives on the detachment enhancement entry — look it up via the
// store's getEnhancementMeta. Returns false for non-enhancement units.
const isUnitUpgrade = computed(() => {
  if (props.unit.name !== "Enhancements") return false;
  return Boolean(armyListStore.getEnhancementMeta(props.unit)?.isUnitUpgrade);
});

const height = computed(() => unitHeightPx(unitPoints.value, props.scale));

const name = computed(() => {
  let name = "";

  if (props.unit.bonus) {
    name += "+ ";
  }

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
    <span class="army-list-unit__name">
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
  flex-basis: v-bind("height");
  flex-shrink: 0;
  justify-content: space-between;
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
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.3px;
    overflow: hidden;
    padding: 0 6px;
    text-transform: uppercase;

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
