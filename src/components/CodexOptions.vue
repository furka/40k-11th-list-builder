<script setup>
import { computed } from "vue";
import DropDown from "./DropDown.vue";
import OptionsIcon from "../assets/setting-line-icon.svg";
import {
  SORT_ALPHABETICAL,
  SORT_CHEAPEST_FIRST,
  SORT_EXPENSIVE_FIRST,
  GROUP_NONE,
  GROUP_ROLE,
} from "../data/constants";
import { useAppStore } from "../stores/app";
import { useMfmStore } from "../stores/mfm";

const appStore = useAppStore();
const mfmStore = useMfmStore();

const hasPreviousMFM = computed(() => !!mfmStore.MFM.PREVIOUS);
const pointsChangesTitle = computed(() =>
  hasPreviousMFM.value
    ? "Show points changes compared to previous MFM"
    : "No previous MFM version to compare against yet"
);
</script>

<template>
  <DropDown class="codex-options" position="right" title="Codex display options">
    <template v-slot:button>
      <OptionsIcon class="dropdown__icon" />
      <span>Options</span>
    </template>
    <template v-slot:content>
      <div class="codex-options__content">
        <label :title="pointsChangesTitle" :class="{ disabled: !hasPreviousMFM }">
          <input
            type="checkbox"
            :checked="appStore.showPointsChanges"
            :disabled="!hasPreviousMFM"
            @change="appStore.showPointsChanges = $event.target.checked"
          />
          Points Changes
        </label>

        <label title="Show Legends units">
          <input
            type="checkbox"
            :checked="appStore.showLegends"
            @change="appStore.showLegends = $event.target.checked"
          />
          Legends
        </label>

        <label
          title="Hide units / detachments that aren't available to add instead of dimming them"
        >
          <input
            type="checkbox"
            :checked="appStore.showAvailableOnly"
            @change="appStore.showAvailableOnly = $event.target.checked"
          />
          Show available only
        </label>

        <label
          title="Set which units are available in your personal collection"
        >
          <input
            type="checkbox"
            :checked="appStore.editCollection"
            @change="appStore.editCollection = $event.target.checked"
          />
          Edit Collection
        </label>

        <label title="Sort Datasheets">
          Sort:
          <select
            :value="appStore.sortOrder"
            @change="appStore.sortOrder = $event.target.value"
          >
            <option>{{ SORT_ALPHABETICAL }}</option>
            <option>{{ SORT_CHEAPEST_FIRST }}</option>
            <option>{{ SORT_EXPENSIVE_FIRST }}</option>
          </select>
        </label>

        <label title="Group Datasheets">
          Group:
          <select
            :value="appStore.group"
            @change="appStore.group = $event.target.value"
          >
            <option>{{ GROUP_NONE }}</option>
            <option>{{ GROUP_ROLE }}</option>
          </select>
        </label>
      </div>
    </template>
  </DropDown>
</template>

<style scoped lang="scss">
.codex-options {
  &__content {
    padding: 0;
  }

  input,
  select {
    background-color: var(--color-bg);
    border: 1px solid var(--color-divider);
    border-radius: 2px;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 15px;
    padding: 5px 8px;

    option {
      background-color: var(--color-surface);
      color: var(--color-text);
    }

    &::placeholder {
      color: var(--color-text-muted);
    }

    &:focus {
      border-color: var(--color-accent);
      outline: none;
    }
  }

  select {
    flex-grow: 1;
    margin-inline-start: 8px;
  }

  input[type="checkbox"] {
    width: 1em;
    height: 1em;
    accent-color: var(--color-accent);
  }

  label {
    align-items: center;
    color: var(--color-text);
    cursor: pointer;
    display: flex;
    flex-direction: row;
    font-family: var(--font-body);
    font-size: 15px;
    gap: 8px;
    padding: 10px 16px;
  }

  label + label {
    border-top: 1px solid var(--color-divider);
  }

  label.disabled {
    color: var(--color-text-muted);
    cursor: not-allowed;
    opacity: 0.55;

    input {
      cursor: not-allowed;
    }
  }
}
</style>
