<script setup>
import { useArmyListStore } from "../stores/armyList";

const armyListStore = useArmyListStore();

const props = defineProps({
  name: String,
  dp: Number,
});

function remove() {
  armyListStore.removeDetachment(props.name);
}
</script>

<template>
  <div class="army-list-detachment" :title="props.name">
    <span class="army-list-detachment__name">{{ props.name }}</span>
    <span class="army-list-detachment__badge">{{ props.dp }}DP</span>
    <button
      type="button"
      class="army-list-detachment__remove"
      @click="remove"
      aria-label="Remove detachment"
    >
      ×
    </button>
  </div>
</template>

<style scoped lang="scss">
.army-list-detachment {
  align-items: center;
  background-color: rgb(40 60 90);
  border: 1px solid #000;
  box-sizing: border-box;
  color: #fff;
  cursor: move;
  display: flex;
  font-family: sans-serif;
  font-size: 12px;
  font-weight: bold;
  gap: 6px;
  height: 22px;
  padding: 0 6px;

  &__name {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__badge {
    background-color: rgba(0, 0, 0, 0.4);
    border-radius: 2px;
    font-size: 10px;
    padding: 1px 4px;
  }

  &__remove {
    background: none;
    border: none;
    color: #fff;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0 4px;

    &:hover {
      color: #f88;
    }
  }
}
.sortable-ghost {
  opacity: 0;
}
</style>
