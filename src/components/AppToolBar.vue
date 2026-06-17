<script setup>
import { computed } from "vue";
import ViewListModal from "./ViewListModal.vue";
import OpenListModal from "./OpenListModal.vue";
import NewListModal from "./NewListModal.vue";
import ToolBar from "./ToolBar.vue";
import ShareListModal from "./ShareListModal.vue";
import { useArmyListStore } from "../stores/armyList";

const armyListStore = useArmyListStore();

const points = computed(() => armyListStore.pointsBreakdown.total);
</script>

<template>
  <ToolBar class="app-toolbar">
    <template v-if="armyListStore.faction">
      <div class="toolbar__group toolbar__group--points">
        <label>
          <span :class="{ over: points > armyListStore.effectiveMaxPoints }">
            {{ points }}
          </span>
          /
          <input
            type="number"
            min="500"
            step="500"
            :value="armyListStore.maxPoints"
            @input="armyListStore.maxPoints = parseInt($event.target.value)"
            class="toolbar__points-input"
            :style="{
              width:
                Math.max(
                  5,
                  armyListStore.maxPoints.toString().length + 3
                ) + 'ch',
            }"
          />
        </label>
      </div>

      <div class="toolbar__group">
        <ViewListModal />
        <ShareListModal />
      </div>

      <div class="toolbar__group toolbar__group--list-name">
        <input
          type="text"
          :value="armyListStore.name"
          @input="armyListStore.name = $event.target.value"
          placeholder="Name your list"
          class="toolbar__list-name"
        />
      </div>
    </template>

    <div class="toolbar__group toolbar__group--actions">
      <NewListModal />
      <OpenListModal />
    </div>
  </ToolBar>
</template>

<style scoped lang="scss">
.app-toolbar {
  .toolbar {
    &__list-name {
      width: 100%;
    }

    &__group {
      &--list-name {
        flex-grow: 1;

        @media (max-width: 768px) {
          display: none;
        }
      }

      &--points {
        display: flex;
        gap: 12px;
        min-width: 250px;

        @media (max-width: 768px) {
          min-width: 0;
        }

        label {
          margin-left: auto;
          cursor: pointer;
        }

        .over {
          color: var(--color-negative);
        }
      }

      &--actions {
        margin-left: auto;
      }
    }

  }
}
</style>
