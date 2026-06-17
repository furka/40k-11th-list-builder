<script setup>
import { computed } from "vue";
import {
  SORT_MANUAL,
  SORT_ALPHABETICAL,
  SORT_CHEAPEST_FIRST,
  SORT_EXPENSIVE_FIRST,
  SORT_ROLE,
} from "../data/constants";
import DropDown from "./DropDown.vue";
import SortIcon from "../assets/descending-icon.svg";
import { useArmyListStore } from "../stores/armyList";

const armyListStore = useArmyListStore();

function setSortMode(mode) {
  armyListStore.sortOrder = mode;
}
</script>

<template>
  <DropDown class="sort-army" title="Change army list sort order">
    <template v-slot:button>
      <span>Sort: {{ armyListStore.sortOrder || SORT_MANUAL }}</span>
      <SortIcon class="dropdown__icon" />
    </template>
    <template v-slot:content>
      <form method="dialog">
        <h1>Sort Army List</h1>
        <button
          @click="setSortMode(SORT_MANUAL)"
          :class="{ active: (armyListStore.sortOrder || SORT_MANUAL) === SORT_MANUAL }"
        >
          {{ SORT_MANUAL }}
        </button>
        <button
          @click="setSortMode(SORT_ALPHABETICAL)"
          :class="{ active: (armyListStore.sortOrder || SORT_MANUAL) === SORT_ALPHABETICAL }"
        >
          {{ SORT_ALPHABETICAL }}
        </button>
        <button
          @click="setSortMode(SORT_CHEAPEST_FIRST)"
          :class="{ active: (armyListStore.sortOrder || SORT_MANUAL) === SORT_CHEAPEST_FIRST }"
        >
          {{ SORT_CHEAPEST_FIRST }}
        </button>
        <button
          @click="setSortMode(SORT_EXPENSIVE_FIRST)"
          :class="{ active: (armyListStore.sortOrder || SORT_MANUAL) === SORT_EXPENSIVE_FIRST }"
        >
          {{ SORT_EXPENSIVE_FIRST }}
        </button>
        <button
          @click="setSortMode(SORT_ROLE)"
          :class="{ active: (armyListStore.sortOrder || SORT_MANUAL) === SORT_ROLE }"
        >
          {{ SORT_ROLE }}
        </button>
      </form>
    </template>
  </DropDown>
</template>

<style scoped lang="scss">
.sort-army {
  :deep(.dropdown__button) {
    flex-direction: row;
    gap: 8px;
  }

  form {
    display: flex;
    flex-direction: column;
  }

  h1 {
    padding: 10px 16px;
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 1.4px;
    color: var(--color-text-muted);
    margin: 0;
    border-bottom: 1px solid var(--color-divider);
    text-align: center;
    text-transform: uppercase;
  }

  button {
    background: none;
    border: none;
    color: var(--color-text);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 15px;
    padding: 10px 16px;
    text-align: left;

    & + button {
      border-top: 1px solid var(--color-divider);
    }

    &:hover {
      background: var(--color-header);
    }

    &.active {
      background: var(--color-header);
      color: var(--color-accent);
      font-weight: 600;
    }
  }
}
</style>
