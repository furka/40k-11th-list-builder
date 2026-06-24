<script setup>
import SortArmyButton from "./SortArmyButton.vue";
import ToolBar from "./ToolBar.vue";
</script>

<template>
  <ToolBar class="sort-bar">
    <div class="toolbar__group toolbar__group--sort">
      <SortArmyButton />
    </div>
  </ToolBar>
</template>

<style scoped lang="scss">
.sort-bar {
  // Bottom-anchor the sort button to align with the codex toolbar's
  // bottom-aligned faction title across the list/codex seam.
  align-items: flex-end;
  padding-bottom: 4px;

  .toolbar {
    &__group {
      &--sort {
        flex-grow: 1;
      }
    }
  }

  :deep(.dropdown),
  :deep(.dropdown__button) {
    box-sizing: border-box;
    width: 100%;
  }
}
</style>
