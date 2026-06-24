<script setup>
import { computed, ref } from "vue";
import CodexOptions from "./CodexOptions.vue";
import SortArmyButton from "./SortArmyButton.vue";
import ToggleSwitch from "./ToggleSwitch.vue";
import ToolBar from "./ToolBar.vue";
import AlliesPickerModal from "./AlliesPickerModal.vue";
import { useArmyListStore } from "../stores/armyList";
import { useAppStore } from "../stores/app";
import { bypassTitle } from "../utils/bypass-title";
const armyListStore = useArmyListStore();
const appStore = useAppStore();

const alliesModalRef = ref(null);

const freeAttachLabel = computed(() =>
  appStore.freeAttach ? "Bypass Restrictions" : "Enforce Restrictions"
);
const editCollectionLabel = computed(() =>
  appStore.editCollection ? "Edit Collection" : "Lock Collection"
);

const primaryTitle = computed(() => armyListStore.faction);
const allyNames = computed(() => (armyListStore.allies ?? []).filter(Boolean));

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
        {{ primaryTitle
        }}<span
          v-for="ally in allyNames"
          :key="ally"
          class="toolbar__faction-label-allies"
        >
          + {{ ally }}</span
        ><button
          type="button"
          class="toolbar__faction-label-allies toolbar__add-allies"
          v-tooltip="
            allyNames.length ? 'Edit allied factions' : 'Add allied factions'
          "
          @click="openAllies"
        >
          + Add Allies</button
        >
      </span>
    </div>

    <div
      v-if="appStore.inlineCodexToggles"
      class="toolbar__group toolbar__group--toggles"
    >
      <ToggleSwitch
        v-model="appStore.freeAttach"
        :label="freeAttachLabel"
        :tooltip="bypassTitle"
      />
      <ToggleSwitch
        v-model="appStore.editCollection"
        :label="editCollectionLabel"
        tooltip="Set which units are available in your personal collection"
      />
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
        // Match the 250px army-list pane (ArmyList.vue) so the sort button's
        // right edge meets the army-list / codex seam.
        width: 250px;
        flex-shrink: 0;
      }

      // Rendered only when appStore.inlineCodexToggles is true; otherwise the
      // switches live in the Options dropdown (see CodexOptions.vue).
      &--toggles {
        flex-shrink: 0;
        gap: 16px;
        margin: 0 8px;
      }

      &--filter {
        @media (max-width: 1160px) {
          display: none;
        }
      }

      &--faction {
        flex-grow: 1;
        // Cancel the toolbar's 4px inter-group gap so the title's left edge
        // sits exactly on the codex seam (right after the 250px sort group).
        margin-inline-start: -4px;
        // min-width: 0 lets the faction label shrink + truncate instead of
        // pushing this flex group wider than its share of the toolbar (which
        // would either overflow the fixed 64px toolbar height or shove
        // adjacent groups off-screen — the army list's layout math depends
        // on the toolbar staying its declared height).
        min-width: 0;
        justify-content: flex-start;
        // Bottom-align the Add Allies button with the title's descender so it
        // anchors to the same baseline as the faction name.
        align-items: flex-end;
        gap: 12px;
      }
    }

    &__add-allies {
      // Rendered as the last link in the faction chain, styled like an ally
      // (inherits .toolbar__faction-label-allies) but interactive.
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
      font-family: inherit;
      text-transform: uppercase;
      color: #fff;
      opacity: 1;

      &:hover {
        color: var(--color-accent);
      }
    }
  }
}
</style>
