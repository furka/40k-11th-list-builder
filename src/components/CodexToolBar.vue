<script setup>
import CodexOptions from "./CodexOptions.vue";
import SortArmyButton from "./SortArmyButton.vue";
import ToolBar from "./ToolBar.vue";
import { useArmyListStore } from "../stores/armyList";
import { useAppStore } from "../stores/app";

const armyListStore = useArmyListStore();
const appStore = useAppStore();
</script>

<template>
  <ToolBar class="codex-toolbar">
    <div class="toolbar__group toolbar__group--sort">
      <SortArmyButton />
    </div>

    <div class="toolbar__group toolbar__group--faction">
      <span class="toolbar__faction-label">
        {{ armyListStore.faction }}
      </span>
    </div>

    <div class="toolbar__group toolbar__group--filter">
      <input
        type="text"
        :value="appStore.codexFilter"
        @input="appStore.codexFilter = $event.target.value"
        placeholder="Filter Datasheets"
        class="toolbar__codex-filter"
      />
    </div>

    <div class="toolbar__group">
      <CodexOptions />
    </div>
  </ToolBar>
</template>

<style scoped lang="scss">
.codex-toolbar {
  .toolbar {
    &__codex-filter {
      width: 7em;
    }

    &__faction-label {
      text-transform: uppercase;
      font-family: var(--font-display);
      font-size: clamp(18px, 4.5vw, 50px);
      line-height: 1;
      letter-spacing: 0.5px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__group {
      &--sort {
        display: flex;
        justify-content: flex-end;
        min-width: 250px;

        @media (max-width: 768px) {
          min-width: 0;
        }
      }

      &--filter {
        @media (max-width: 1160px) {
          display: none;
        }
      }

      &--faction {
        flex-grow: 1;
        justify-content: center;
      }
    }
  }
}
</style>
