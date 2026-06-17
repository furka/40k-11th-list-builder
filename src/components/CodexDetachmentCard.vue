<script setup>
import { computed } from "vue";
import { v4 as uuidv4 } from "uuid";
import { useArmyListStore } from "../stores/armyList";

const armyListStore = useArmyListStore();

const props = defineProps({
  detachment: Object,
});

const selected = computed(() =>
  armyListStore.detachments.includes(props.detachment.name)
);

const cantAddReason = computed(() =>
  armyListStore.whyCantAddDetachment(props.detachment.name)
);
const disabled = computed(
  () => !selected.value && cantAddReason.value !== null
);

function onTitleClick() {
  if (disabled.value || selected.value) return;
  armyListStore.addDetachment(props.detachment.name);
}

function onEnhancementClick(enh) {
  if (disabled.value) return;
  if (!selected.value) {
    const ok = armyListStore.addDetachment(props.detachment.name);
    if (!ok) return;
  }
  armyListStore.addUnit({
    id: uuidv4(),
    name: "Enhancements",
    optionName: enh.name,
    // Tag the parent detachment so removeDetachment can cascade-delete this
    // enhancement when the parent leaves the list (drag-to-bin etc.).
    detachment: props.detachment.name,
  });
}
</script>

<template>
  <div
    class="data-sheet detachment-sheet"
    :class="{ 'detachment-sheet--selected': selected }"
    :title="disabled ? cantAddReason : ''"
  >
    <div
      class="data-sheet__title detachment-sheet__title"
      :class="{ maxed: disabled }"
      @click="onTitleClick"
    >
      <span class="data-sheet__name">
        {{ detachment.name }}
      </span>
      <span class="detachment-sheet__badge">{{ detachment.dp }}DP</span>
    </div>
    <ul>
      <li
        v-for="enh in detachment.enhancements"
        :key="enh.name"
        :class="{ maxed: disabled }"
        @click="onEnhancementClick(enh)"
      >
        <span class="data-sheet__option-name">{{ enh.name }}</span>
        <span class="data-sheet__option-spacer"></span>
        <span class="data-sheet__points">{{ enh.points }} pts</span>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.data-sheet {
  margin-bottom: 1px;
  width: 300px;
  writing-mode: horizontal-tb;

  &__title {
    align-items: flex-end;
    background-color: rgba(0, 0, 0, 0.65);
    color: #fff;
    display: flex;
    font-weight: bold;
    justify-content: space-between;
    padding: 2px 4px;
    position: relative;
  }

  &__name {
    line-height: 20px;
    text-transform: capitalize;
  }

  &__option-name {
    text-transform: capitalize;
  }

  &__option-spacer {
    border-bottom: 2px dotted black;
    flex-grow: 1;
    margin: 4px 2px;
  }

  &__points {
    flex-shrink: 0;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    border-radius: 3px;
    border: 2px solid transparent;
    cursor: pointer;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 2px;

    &:hover {
      border-color: black;
    }
  }

  .maxed {
    cursor: not-allowed;
    opacity: 0.25;

    li {
      cursor: not-allowed;

      &:hover {
        border-color: transparent;
      }
    }
  }
}

.detachment-sheet {
  &--selected {
    box-shadow: inset 4px 0 0 #2e6b3e;
  }

  &__title {
    cursor: pointer;
  }

  &__badge {
    background-color: rgba(0, 0, 0, 0.5);
    border-radius: 2px;
    color: #fff;
    font-size: 11px;
    padding: 1px 6px;
  }
}
</style>
