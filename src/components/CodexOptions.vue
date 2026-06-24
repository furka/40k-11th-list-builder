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

const freeAttachLabel = computed(() =>
  appStore.freeAttach ? "Enforce Restrictions" : "Bypass Restrictions"
);
const editCollectionLabel = computed(() =>
  appStore.editCollection ? "Lock Collection" : "Edit Collection"
);
const legendsLabel = computed(() =>
  appStore.showLegends ? "Hide Legends" : "Show Legends"
);
const pointsChangesLabel = computed(() =>
  appStore.showPointsChanges ? "Hide Points Changes" : "Show Points Changes"
);
const keywordsLabel = computed(() =>
  appStore.showKeywords ? "Hide Keywords" : "Show Keywords"
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
        <label v-tooltip="bypassTitle">
          <input
            type="checkbox"
            :checked="appStore.freeAttach"
            @change="appStore.freeAttach = $event.target.checked"
          />
          <span class="switch"></span>
          {{ freeAttachLabel }}
        </label>

        <label
          v-tooltip="'Set which units are available in your personal collection'"
        >
          <input
            type="checkbox"
            :checked="appStore.editCollection"
            @change="appStore.editCollection = $event.target.checked"
          />
          <span class="switch"></span>
          {{ editCollectionLabel }}
        </label>

        <label v-tooltip="'Show Legends units'">
          <input
            type="checkbox"
            :checked="appStore.showLegends"
            @change="appStore.showLegends = $event.target.checked"
          />
          <span class="switch"></span>
          {{ legendsLabel }}
        </label>

        <label
          v-if="hasPreviousVersion"
          v-tooltip="'Show points changes compared to previous MFM version'"
        >
          <input
            type="checkbox"
            :checked="appStore.showPointsChanges"
            @change="appStore.showPointsChanges = $event.target.checked"
          />
          <span class="switch"></span>
          {{ pointsChangesLabel }}
        </label>

        <label v-tooltip="'Show keywords on datasheets'">
          <input
            type="checkbox"
            :checked="appStore.showKeywords"
            @change="appStore.showKeywords = $event.target.checked"
          />
          <span class="switch"></span>
          {{ keywordsLabel }}
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
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .switch {
    flex-shrink: 0;
    position: relative;
    width: 34px;
    height: 18px;
    border-radius: 999px;
    background-color: var(--color-divider);
    transition: background-color 0.15s ease;

    &::after {
      content: "";
      position: absolute;
      top: 2px;
      inset-inline-start: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background-color: var(--color-surface);
      transition: transform 0.15s ease;
    }
  }

  input[type="checkbox"]:checked + .switch {
    background-color: var(--color-accent);

    &::after {
      transform: translateX(16px);
    }
  }

  input[type="checkbox"]:focus-visible + .switch {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
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
