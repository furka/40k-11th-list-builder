<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import ArmyListUnitNode from "./ArmyListUnitNode.vue";
import ArmyListDetachment from "./ArmyListDetachment.vue";
import DropOverlay from "./DropOverlay.vue";
import DetachmentDropOverlay from "./DetachmentDropOverlay.vue";
import RiskIcon from "../assets/risk-icon.svg";
import { useArmyListStore } from "../stores/armyList";
import { useDragStore } from "../stores/drag";
import { useSlotEl } from "../composables/useSlotEl";
import { computeLayout, emptyHeightPx } from "../utils/unit-sizing";

const armyListStore = useArmyListStore();
const dragStore = useDragStore();

const rootUnits = computed(() =>
  armyListStore.units.filter((u) => !u.attachedTo)
);

// Per-row indexInParent in dragged-excluded space (see useRowEl). The dragged
// row gets the index its position WOULD have without it; the drag store
// filters it out anyway.
const rootIndices = computed(() => {
  const out = [];
  let nonDraggedIdx = 0;
  for (const u of rootUnits.value) {
    out.push(nonDraggedIdx);
    if (u.id !== dragStore.draggedId) nonDraggedIdx++;
  }
  return out;
});

const dp = computed(() => armyListStore.pointsBreakdown.dp);
const dpOver = computed(() => !!dp.value && dp.value.used > dp.value.max);
const detachmentList = computed(() => dp.value?.byDetachment ?? []);

// See the original comment in this file: measuring the rendered border-box
// height directly is more reliable than computing it from the surrounding
// chrome.
const armyListEl = ref(null);
const armyListHeight = ref(0);
let resizeObserver = null;

watch(
  armyListEl,
  (el, _, onCleanup) => {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (!el) {
      armyListHeight.value = 0;
      return;
    }
    const measure = () => {
      armyListHeight.value = el.getBoundingClientRect().height;
    };
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el);
    measure();
    onCleanup(() => {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
    });
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

// 1px gap between top-level army-list-unit-nodes — visually interrupts the
// orange grouping stripe so adjacent grouped blobs read as separate units.
// Each gap eats 1px of panel height, so subtract their total before scaling
// rows; otherwise the rows + gaps + empty-space band would overflow.
const ROOT_GAP_PX = 1;
const rootGapTotal = computed(() =>
  Math.max(0, rootUnits.value.length - 1) * ROOT_GAP_PX
);

const points = computed(() => armyListStore.pointsBreakdown.total);

const numUnits = computed(() => armyListStore.units.length);

const layout = computed(() =>
  computeLayout(
    Math.max(0, armyListHeight.value - rootGapTotal.value),
    armyListStore.effectiveMaxPoints,
    points.value,
    numUnits.value
  )
);

const scale = computed(() => layout.value.scale);

// Stringified so it can drop straight into the CSS custom property on
// `.army-list-pane`; descendant `.army-list-unit` rows compose it with their
// own scaled portion via `calc(var(--row-baseline) + …)`.
const rowBaselineCss = computed(() => `${layout.value.rowBaseline}px`);

const emptySpace = computed(() =>
  emptyHeightPx(
    armyListStore.effectiveMaxPoints,
    points.value,
    scale.value
  )
);

// Register the army-list panel as a named slot so pointer positions inside
// the panel but outside any row (the empty space above the topmost unit,
// from the visual-scaling padding-top) still resolve to a sensible drop —
// "insert above the topmost root row" / "insert below the bottommost". The
// alternative would be a null active slot whenever the user hovers empty
// space, which surprises users on lightly-populated lists.
useSlotEl(armyListEl, () => (dragStore.draggedId ? "army-list-area" : null));
</script>

<template>
  <div class="army-list-pane" :style="{ '--row-baseline': rowBaselineCss }">
    <div class="army-list-detachments">
      <div class="army-list-detachments__header">
        <span>Detachments</span>
        <span
          v-if="dp"
          class="army-list-detachments__dp"
          :class="{ 'army-list-detachments__dp--over': dpOver }"
        >
          <RiskIcon
            v-if="dpOver"
            class="army-list-detachments__warning-icon"
            v-tooltip="'Your detachments exceed the DP budget for this battle size. Remove a detachment or raise your max points.'"
          />
          {{ dp.used }} / {{ dp.max }} DP
        </span>
      </div>
      <div class="army-list-detachments__list">
        <ArmyListDetachment
          v-for="(element, i) in detachmentList"
          :key="element.name"
          :name="element.name"
          :dp="element.dp"
          :role="element.role"
          :index="i"
        />
        <DetachmentDropOverlay />
      </div>
    </div>
    <div class="army-list" ref="armyListEl">
      <div class="army-list__list">
        <ArmyListUnitNode
          v-for="(unit, i) in rootUnits"
          :key="unit.id"
          :unit="unit"
          :scale="scale"
          :depth="0"
          parent-key="root"
          :index-in-parent="rootIndices[i]"
        />
      </div>
    </div>
    <DropOverlay />
  </div>
</template>

<style scoped lang="scss">
.army-list-pane {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}

.army-list-detachments {
  background-color: var(--color-header);
  color: var(--color-text);
  flex-shrink: 0;
  font-family: var(--font-body);
  padding: 6px 8px;

  &__header {
    align-items: center;
    border-bottom: 1px solid var(--color-divider);
    color: var(--color-text-muted);
    display: flex;
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 600;
    justify-content: space-between;
    letter-spacing: 1.2px;
    padding: 2px 2px 6px;
    text-transform: uppercase;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 6px;
    min-height: 24px;
  }

  &__dp {
    align-items: center;
    display: inline-flex;
    gap: 4px;

    &--over {
      color: var(--color-negative);
    }
  }

  &__warning-icon {
    cursor: help;
    height: 14px;
    width: 14px;
  }
}

.army-list {
  background-color: var(--color-bg);
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;

  &__list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    height: 100%;
    justify-content: flex-end;
    padding-top: v-bind("emptySpace");
    box-sizing: border-box;
  }
}
</style>
