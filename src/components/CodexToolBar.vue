<script setup>
import { computed, ref } from "vue";
import CodexOptions from "./CodexOptions.vue";
import SortArmyButton from "./SortArmyButton.vue";
import ToolBar from "./ToolBar.vue";
import AlliesPickerModal from "./AlliesPickerModal.vue";
import { useArmyListStore } from "../stores/armyList";
import { useAppStore } from "../stores/app";
const armyListStore = useArmyListStore();
const appStore = useAppStore();

const alliesModalRef = ref(null);

const primaryTitle = computed(() => armyListStore.faction);
const alliesSuffix = computed(() => {
  const list = (armyListStore.allies ?? []).filter(Boolean);
  return list.length ? ` + ${list.join(" + ")}` : "";
});

const alliesCount = computed(() => armyListStore.allies.length);

function openAllies() {
  alliesModalRef.value?.open();
}
</script>

<template>
  <ToolBar class="codex-toolbar">
    <div class="toolbar__group toolbar__group--sort">
      <SortArmyButton />
    </div>

    <div class="toolbar__group toolbar__group--faction">
      <span class="toolbar__faction-label">
        {{ primaryTitle }}<span
          v-if="alliesSuffix"
          class="toolbar__faction-label-allies"
          >{{ alliesSuffix }}</span
        >
      </span>
    </div>

    <div class="toolbar__group toolbar__group--allies">
      <button
        type="button"
        class="toolbar__allies-button"
        :class="{ 'toolbar__allies-button--active': alliesCount > 0 }"
        v-tooltip="alliesCount > 0 ? 'Edit allied factions' : 'Add allied factions'"
        @click="openAllies"
      >
        Allies<span v-if="alliesCount > 0" class="toolbar__allies-count">
          · {{ alliesCount }}
        </span>
      </button>
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

    <!--
      Mounted inside the toolbar so CodexToolBar stays a single-root
      component — fragments (multi-root) disable Vue's class fallthrough,
      and App.vue depends on `app__codex-toolbar` reaching the toolbar
      element to set its fixed 64px height. The dialog itself is
      `display: none` until opened (and `position: fixed` when modal),
      so it doesn't participate in the toolbar's flex layout.
    -->
    <AlliesPickerModal ref="alliesModalRef" />
  </ToolBar>
</template>

<style scoped lang="scss">
.codex-toolbar {
  // Override the base toolbar's center-alignment so every group in this
  // taller (64px) toolbar sits on the bottom edge — the big faction title
  // visually anchors to the codex panel below instead of floating in space.
  align-items: flex-end;
  // The default toolbar has padded space on the sides only via gap; for a
  // bottom-aligned title we want a hair of breathing room below.
  padding-bottom: 4px;

  .toolbar {
    &__codex-filter {
      width: 7em;
    }

    &__faction-label {
      text-transform: uppercase;
      font-family: var(--font-display);
      font-size: 45px;
      line-height: 1;
      letter-spacing: 0.5px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__faction-label-allies {
      // Independent of the primary's clamp() so a large primary (50px) doesn't
      // drag the allies up with it. Keeps the allies text compact and the
      // total label width tractable within the toolbar's faction slot.
      font-size: clamp(11px, 1.4vw, 16px);
      letter-spacing: 0.4px;
      margin-left: 4px;
      opacity: 0.85;
      // Bottom-align with the primary's descender so the smaller text
      // anchors to the same baseline as TYRANIDS / DARK ANGELS / etc.
      vertical-align: baseline;
    }

    &__group {
      &--sort {
        display: flex;
        justify-content: flex-end;
        min-width: 250px;

        @media (max-width: 768px) {
          min-width: 0;
        }
      }

      &--filter {
        @media (max-width: 1160px) {
          display: none;
        }
      }

      &--faction {
        flex-grow: 1;
        // min-width: 0 lets the centered label shrink + truncate instead of
        // pushing this flex group wider than its share of the toolbar (which
        // would either overflow the fixed 64px toolbar height or shove
        // adjacent groups off-screen — the army list's layout math depends
        // on the toolbar staying its declared height).
        min-width: 0;
        justify-content: center;
      }

      &--allies {
        flex-shrink: 0;
      }
    }

    &__allies-button {
      // Match the look of `.toolbar__button` / `.modal-button` /
      // `.dropdown__button` (NEW / SAVED / OPTIONS / VIEW / SHARE) so the
      // toolbar reads as one consistent button row.
      align-items: center;
      background: var(--color-surface);
      border: 1px solid var(--color-divider);
      border-radius: 2px;
      color: var(--color-text);
      cursor: pointer;
      display: flex;
      flex-direction: row;
      flex-shrink: 0;
      font-family: var(--font-display);
      font-size: 16px;
      gap: 8px;
      justify-content: center;
      letter-spacing: 0.5px;
      margin: 0 4px;
      padding: 7px 12px;
      text-transform: uppercase;

      &:hover {
        background: var(--color-header);
        border-color: var(--color-accent);
      }

      &--active {
        border-color: var(--color-accent);
        color: var(--color-accent);
      }
    }

    &__allies-count {
      font-weight: 600;
    }
  }
}
</style>
