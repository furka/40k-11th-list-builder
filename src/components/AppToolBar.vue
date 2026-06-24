<script setup>
import ViewListModal from "./ViewListModal.vue";
import OpenListModal from "./OpenListModal.vue";
import NewListModal from "./NewListModal.vue";
import ToolBar from "./ToolBar.vue";
import ShareListModal from "./ShareListModal.vue";
import { useArmyListStore } from "../stores/armyList";

const armyListStore = useArmyListStore();
</script>

<template>
  <ToolBar class="app-toolbar">
    <template v-if="armyListStore.faction">
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

      &--actions {
        margin-left: auto;
      }
    }

  }
}
</style>
