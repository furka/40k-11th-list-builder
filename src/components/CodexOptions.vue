<script setup>
import { computed } from "vue";
import DropDown from "./DropDown.vue";
import OptionsIcon from "../assets/setting-line-icon.svg";
import {
  SORT_ALPHABETICAL,
  SORT_CHEAPEST_FIRST,
  SORT_EXPENSIVE_FIRST,
} from "../data/constants";
import { useAppStore } from "../stores/app";
import { useMfmStore } from "../stores/mfm";

const appStore = useAppStore();
const mfmStore = useMfmStore();

const hasPreviousVersion = computed(
  () => !!mfmStore.getPreviousMFM(mfmStore.MFM.CURRENT)
);

const bypassModifierKey = (() => {
  if (typeof navigator === "undefined") return "Ctrl";
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘" : "Ctrl";
})();
const bypassTitle = `Attach units and enhancements without restrictions.\n\nOr hold ${bypassModifierKey} while dragging.`;
</script>

<template>
  <DropDown class="codex-options" position="right" title="Codex display options">
    <template v-slot:button>
      <OptionsIcon class="dropdown__icon" />
      <span>Options</span>
    </template>
    <template v-slot:content>
      <div class="codex-options__content">
        <label
          v-if="hasPreviousVersion"
          v-tooltip="'Show points changes compared to previous MFM version'"
        >
          <input
            type="checkbox"
            :checked="appStore.showPointsChanges"
            @change="appStore.showPointsChanges = $event.target.checked"
          />
          Points Changes
        </label>

        <label v-tooltip="'Show Legends units'">
          <input
            type="checkbox"
            :checked="appStore.showLegends"
            @change="appStore.showLegends = $event.target.checked"
          />
          Legends
        </label>

        <label v-tooltip="'Show full keyword list at the bottom of each datasheet'">
          <input
            type="checkbox"
            :checked="appStore.showKeywords"
            @change="appStore.showKeywords = $event.target.checked"
          />
          Show Keywords
        </label>

        <label
          v-tooltip="`Hide units / detachments that aren't available to add instead of dimming them`"
        >
          <input
            type="checkbox"
            :checked="appStore.showAvailableOnly"
            @change="appStore.showAvailableOnly = $event.target.checked"
          />
          Show available only
        </label>

        <label v-tooltip="bypassTitle">
          <input
            type="checkbox"
            :checked="appStore.freeAttach"
            @change="appStore.freeAttach = $event.target.checked"
          />
          Bypass restrictions
        </label>

        <label
          v-tooltip="'Set which units are available in your personal collection'"
        >
          <input
            type="checkbox"
            :checked="appStore.editCollection"
            @change="appStore.editCollection = $event.target.checked"
          />
          Edit Collection
        </label>

        <label v-tooltip="'Sort Datasheets'">
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
