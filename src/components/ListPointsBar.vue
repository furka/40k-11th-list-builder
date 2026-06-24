<script setup>
import { computed } from "vue";
import ToolBar from "./ToolBar.vue";
import { useArmyListStore } from "../stores/armyList";

const armyListStore = useArmyListStore();

const points = computed(() => armyListStore.pointsBreakdown.total);

// Both the current-points and max-points fields share one width so the "/"
// separator stays put regardless of how many digits the current total has
// (10 -> 100 -> 1000+). The current points hug the "/" from the left, the max
// from the right.
const fieldWidth = computed(
  () => Math.max(5, armyListStore.maxPoints.toString().length + 3) + "ch"
);
</script>

<template>
  <ToolBar class="points-bar">
    <div class="toolbar__group toolbar__group--points">
      <label class="points">
        <span
          class="points__current"
          :class="{ over: points > armyListStore.effectiveMaxPoints }"
        >
          {{ points }}
        </span>
        <span class="points__sep">/</span>
        <input
          type="number"
          min="500"
          step="500"
          :value="armyListStore.maxPoints"
          @input="armyListStore.maxPoints = parseInt($event.target.value)"
          class="points__max"
          :style="{ width: fieldWidth }"
        />
      </label>
    </div>
  </ToolBar>
</template>

<style scoped lang="scss">
.points-bar {
  .toolbar {
    &__group {
      &--points {
        display: flex;
        flex-grow: 1;
      }
    }
  }

  .points {
    align-items: center;
    column-gap: 8px;
    cursor: pointer;
    display: grid;
    // Equal side columns put the "/" at the bar's horizontal center; each
    // number hugs it from its side, so neither moves as the totals change.
    flex-grow: 1;
    grid-template-columns: 1fr auto 1fr;

    &__current {
      justify-self: end;
      min-width: 0;

      &.over {
        color: var(--color-negative);
      }
    }

    &__max {
      justify-self: start;
    }
  }
}
</style>
