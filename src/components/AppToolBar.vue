<script setup>
import { computed } from "vue";
import ViewListModal from "./ViewListModal.vue";
import OpenListModal from "./OpenListModal.vue";
import NewIcon from "../assets/file-line-icon.svg";
import ToolBar from "./ToolBar.vue";
import ShareListModal from "./ShareListModal.vue";
import { useArmyListStore } from "../stores/armyList";
import { useAppStore } from "../stores/app";

const armyListStore = useArmyListStore();
const appStore = useAppStore();

const points = computed(() => armyListStore.pointsBreakdown.total);
const dp = computed(() => armyListStore.pointsBreakdown.dp);
</script>

<template>
  <ToolBar class="app-toolbar">
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
                3,
                armyListStore.maxPoints.toString().length + 1
              ) + 'ch',
          }"
        />
      </label>
      <label v-if="dp" class="toolbar__dp" title="Detachment Points">
        <span :class="{ over: dp.used > dp.max }">{{ dp.used }}</span>
        / {{ dp.max }} DP
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

    <div class="toolbar__group">
      <button
        class="toolbar__button"
        @click="appStore.newList"
        title="Create a new army list"
      >
        <NewIcon class="toolbar__icon" />
        <span>New</span>
      </button>
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
      }

      &--points {
        display: flex;
        gap: 12px;
        justify-content: space-between;
        min-width: 250px;

        label {
          margin-left: auto;
          cursor: pointer;
        }

        .over {
          color: #ff0000;
        }
      }
    }

    &__dp {
      font-size: 0.9em;
      white-space: nowrap;
    }
  }
}
</style>
