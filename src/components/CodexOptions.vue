<script setup>
import { computed } from "vue";
import DropDown from "./DropDown.vue";
import ToggleSwitch from "./ToggleSwitch.vue";
import OptionsIcon from "../assets/setting-line-icon.svg";
import {
  SORT_ALPHABETICAL,
  SORT_CHEAPEST_FIRST,
  SORT_EXPENSIVE_FIRST,
} from "../data/constants";
import { useAppStore } from "../stores/app";
import { useMfmStore } from "../stores/mfm";
import { bypassTitle } from "../utils/bypass-title";

const appStore = useAppStore();
const mfmStore = useMfmStore();

const hasPreviousVersion = computed(
  () => !!mfmStore.getPreviousMFM(mfmStore.MFM.CURRENT)
);

const freeAttachLabel = computed(() =>
  appStore.freeAttach ? "Bypass Restrictions" : "Enforce Restrictions"
);
const editCollectionLabel = computed(() =>
  appStore.editCollection ? "Edit Collection" : "Lock Collection"
);
const legendsLabel = computed(() =>
  appStore.showLegends ? "Show Legends" : "Hide Legends"
);
const pointsChangesLabel = computed(() =>
  appStore.showPointsChanges ? "Show Points Changes" : "Hide Points Changes"
);
const keywordsLabel = computed(() =>
  appStore.showKeywords ? "Show Keywords" : "Hide Keywords"
);

</script>

<template>
  <DropDown class="codex-options" position="right">
    <template v-slot:button>
      <OptionsIcon class="dropdown__icon" />
      <span>Options</span>
    </template>
    <template v-slot:content>
      <div class="codex-options__content">
        <ToggleSwitch
          v-if="!appStore.inlineCodexToggles"
          v-model="appStore.freeAttach"
          :label="freeAttachLabel"
          :tooltip="bypassTitle"
        />

        <ToggleSwitch
          v-if="!appStore.inlineCodexToggles"
          v-model="appStore.editCollection"
          :label="editCollectionLabel"
          tooltip="Set which units are available in your personal collection"
        />

        <ToggleSwitch
          v-model="appStore.showLegends"
          :label="legendsLabel"
          tooltip="Show Legends units"
        />

        <ToggleSwitch
          v-if="hasPreviousVersion"
          v-model="appStore.showPointsChanges"
          :label="pointsChangesLabel"
          tooltip="Show points changes compared to previous MFM version"
        />

        <ToggleSwitch
          v-model="appStore.showKeywords"
          :label="keywordsLabel"
          tooltip="Show keywords on datasheets"
        />

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

  // ToggleSwitch rows carry their own internal layout but still need the
  // dropdown's row padding + divider so they read as menu items.
  .toggle-switch {
    padding: 10px 16px;
  }

  .toggle-switch + .toggle-switch,
  .toggle-switch + label,
  label + .toggle-switch,
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
