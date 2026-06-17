<script setup>
import { computed } from "vue";
import CodexOptions from "./CodexOptions.vue";
import SortArmyButton from "./SortArmyButton.vue";
import ToolBar from "./ToolBar.vue";
import { useArmyListStore } from "../stores/armyList";
import { useMfmStore } from "../stores/mfm";
import { useAppStore } from "../stores/app";

const armyListStore = useArmyListStore();
const mfmStore = useMfmStore();
const appStore = useAppStore();

const factionsFiltered = computed(() => {
  const baseFactions = (armyListStore.currentMFM || mfmStore.MFM.CURRENT)
    .FACTIONS;
  const factionNames = baseFactions.map((f) => f.name);
  factionNames.sort();
  return factionNames;
});
</script>

<template>
  <ToolBar class="codex-toolbar">
    <div class="toolbar__group toolbar__group--sort">
      <SortArmyButton />
    </div>

    <div class="toolbar__group toolbar__group--faction">
      <select
        :value="armyListStore.faction"
        @change="armyListStore.faction = $event.target.value"
        class="toolbar__faction-select"
      >
        <option v-for="faction in factionsFiltered" :value="faction">
          {{ faction.toLowerCase() }}
        </option>
      </select>
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

    &__faction-select {
      text-transform: capitalize;
      max-width: calc(50vw - 300px);

      @media (max-width: 1160px) {
        max-width: calc(50vw - 185px);
      }
    }

    &__group {
      &--sort {
        display: flex;
        justify-content: flex-end;
        min-width: 250px;
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
