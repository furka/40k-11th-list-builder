<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import draggable from "vuedraggable";
import ArmyListUnit from "./ArmyListUnit.vue";
import ArmyListDetachment from "./ArmyListDetachment.vue";
import { SORT_MANUAL } from "../data/constants";
import { useArmyListStore } from "../stores/armyList";

const armyListStore = useArmyListStore();

const dp = computed(() => armyListStore.pointsBreakdown.dp);
const detachmentList = computed(() => dp.value?.byDetachment ?? []);

// Measure the army-list element's rendered height directly. Computing it
// from `appHeight − toolbars − versionBar − detachments-section-height`
// works in theory but is fragile: a sub-pixel difference between
// `window.innerHeight` and `100svh`, or any padding/border we forget to
// account for, leaks through to a few pixels of overflow. Reading the
// actual border-box pixels the layout allocates removes the whole chain of
// guesses. The element's height comes from `flex-grow: 1` in its parent so
// it doesn't depend on its own content — no feedback loop.
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

const scale = computed(() => {
  if (!armyListHeight.value) return 0;
  return armyListHeight.value / armyListStore.effectiveMaxPoints;
});

const points = computed(() => armyListStore.pointsBreakdown.total);

const emptySpace = computed(() => {
  return (
    Math.max(0, armyListStore.effectiveMaxPoints - points.value) *
      scale.value +
    "px"
  );
});

function handleDragChange(event) {
  if (event.moved) {
    armyListStore.sortOrder = SORT_MANUAL;
  }
}

function updateUnits(units) {
  armyListStore.setUnits(units);
}
</script>

<template>
  <div class="army-list-pane">
    <div class="army-list-detachments">
      <div class="army-list-detachments__header">
        <span>Detachments</span>
        <span v-if="dp">{{ dp.used }} / {{ dp.max }} DP</span>
      </div>
      <draggable
        :model-value="detachmentList"
        @update:model-value="
          (newOrder) => armyListStore.setDetachments(newOrder.map((d) => d.name))
        "
        :group="{ name: 'detachments', pull: true, put: true }"
        animation="150"
        item-key="name"
        class="army-list-detachments__list"
        @add="
          (event) => {
            const moved = detachmentList[event.newIndex];
            if (!moved) return;
            const ok = armyListStore.addDetachment(moved.name);
            if (!ok) armyListStore.removeDetachment(moved.name);
          }
        "
      >
        <template #item="{ element }">
          <ArmyListDetachment :name="element.name" :dp="element.dp" />
        </template>
      </draggable>
    </div>
    <div class="army-list" ref="armyListEl">
      <draggable
        :model-value="armyListStore.units"
        @update:model-value="updateUnits"
        group="units"
        animation="150"
        item-key="id"
        class="army-list__draggable"
        @change="handleDragChange"
      >
        <template #item="{ element, index }">
          <ArmyListUnit :unit="element" :scale="scale" />
        </template>
      </draggable>
    </div>
  </div>
</template>

<style scoped lang="scss">
.army-list-pane {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 250px;
}

.army-list-detachments {
  background-color: rgba(0, 0, 0, 0.7);
  color: #fff;
  flex-shrink: 0;
  font-family: sans-serif;
  padding: 4px;

  &__header {
    align-items: center;
    border-bottom: 1px solid #555;
    display: flex;
    font-size: 11px;
    font-weight: bold;
    justify-content: space-between;
    padding: 2px 4px 4px;
    text-transform: uppercase;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 4px;
    min-height: 24px;
  }
}

.army-list {
  background-image: url(../assets/bg-dark.png);
  background-size: 100% 100%;
  flex-grow: 1;
  // Allow the wrapper to shrink inside its flex parent so its measured
  // border-box height is always exactly what the layout allocates, never
  // bloated by content overflow.
  min-height: 0;
  overflow: hidden;
  position: relative;

  &__draggable {
    display: flex;
    flex-direction: column;
    height: 100%;
    justify-content: flex-end;
    padding-top: v-bind("emptySpace");
    box-sizing: border-box;
  }
}
</style>
