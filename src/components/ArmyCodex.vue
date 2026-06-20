<script setup>
import DataSheet from "./DataSheet.vue";
import CodexDetachmentCard from "./CodexDetachmentCard.vue";
import { computed, ref } from "vue";
import { useArmyListStore } from "../stores/armyList";
import { useCodexStore } from "../stores/codex";
import { useAppStore } from "../stores/app";
import { useDragStore } from "../stores/drag";
import { useDetachmentDragStore } from "../stores/detachmentDrag";
import { useSlotEl } from "../composables/useSlotEl";
import { useDetachmentSlotEl } from "../composables/useDetachmentSlotEl";
import { GROUP_NONE } from "../data/constants";
import { isBattleLine } from "../utils/is-battleline";
import { isDedicatedTransport } from "../utils/is-dedicated-transport";

const armyListStore = useArmyListStore();
const codexStore = useCodexStore();
const appStore = useAppStore();
const dragStore = useDragStore();
const detachmentDragStore = useDetachmentDragStore();

const groupedUnits = computed(() => {
  const data = [];
  if (appStore.group === GROUP_NONE) {
    data.push({ title: "", units: codexStore.filteredCompendium });
  } else {
    const characters = { title: "Characters", units: [] };
    const battleLine = { title: "Battle Line", units: [] };
    const transports = { title: "Dedicated Transport", units: [] };
    const other = { title: "Other", units: [] };
    const fortifications = { title: "Fortifications", units: [] };

    data.push(characters, battleLine, transports, other, fortifications);

    codexStore.filteredCompendium.forEach((sheet) => {
      if (sheet.character) {
        characters.units.push(sheet);
      } else if (isBattleLine(sheet)) {
        battleLine.units.push(sheet);
      } else if (isDedicatedTransport(sheet)) {
        transports.units.push(sheet);
      } else if (sheet.fortification) {
        fortifications.units.push(sheet);
      } else {
        other.units.push(sheet);
      }
    });
  }

  return data.filter((group) => group.units.length > 0);
});

const detachmentList = computed(() => codexStore.filteredDetachments);

// Bin: the entire codex panel acts as the deletion drop target while a drag
// is in flight. We register the panel's root element as the `bin` slot so
// the drag store's hit-test picks it up via getBoundingClientRect. No more
// invisible overlay-style draggable.
const codexRootEl = ref(null);
useSlotEl(codexRootEl, () => (dragStore.draggedId ? "bin" : null));
useDetachmentSlotEl(codexRootEl, () =>
  detachmentDragStore.draggedName ? "bin" : null
);

const binActive = computed(
  () =>
    dragStore.activeSlot?.type === "bin" ||
    detachmentDragStore.activeSlot?.type === "bin"
);

// horizontal scroll using scrollwheel
const codexEl = ref(null);
function onScrollWheel(e) {
  e.preventDefault();
  codexEl.value.scrollLeft += e.deltaY;
}
</script>

<template>
  <div class="codex" ref="codexRootEl">
    <div v-if="!armyListStore.faction" class="codex__blank">
      <p>
        No army list yet &mdash; hit <b>New</b> to pick a faction.
      </p>
    </div>
    <template v-else>
    <div class="codex__mfm" @wheel="onScrollWheel" ref="codexEl">
      <template v-if="codexStore.filteredCompendium.length > 0">
        <div class="codex__group" v-for="group in groupedUnits">
          <h2 class="codex__group-title" v-if="group.title">
            {{ group.title }}
          </h2>
          <div class="codex__group-units">
            <DataSheet
              v-for="(unit, index) in group.units"
              :key="unit.name"
              :dataSheet="unit"
            />
          </div>
        </div>
      </template>
      <template v-else>
        <div class="codex__no-units">
          Some units are hidden, enable them in the options
        </div>
      </template>
      <div v-if="detachmentList.length > 0" class="codex__group">
        <h2 class="codex__group-title">Detachments</h2>
        <div class="codex__group-units">
          <CodexDetachmentCard
            v-for="detachment in detachmentList"
            :key="detachment.name"
            :detachment="detachment"
          />
        </div>
      </div>
    </div>
    </template>
    <!--
      Bin tint overlay: appears while any unit drag is in flight, intensifies
      when the codex panel is the active drop target. Pointer-events: none so
      it doesn't intercept clicks or block the codex's own hit-test by the
      drag store (which reads codexRootEl's rect, not the overlay's).
    -->
    <div
      v-if="(dragStore.draggedId || detachmentDragStore.draggedName) && armyListStore.faction"
      class="codex__bin-overlay"
      :class="{ 'codex__bin-overlay--active': binActive }"
    >
      <span v-if="binActive" class="codex__bin-label">Drop to remove</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.codex {
  background-color: #000;
  color: var(--color-text);
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;

  &__mfm {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    overflow-x: auto;
    overflow-y: hidden;
    position: relative;
    writing-mode: vertical-lr;
  }
  &__group {
    display: flex;
    flex-direction: row;

    &-title {
      border-bottom: 1px solid var(--color-divider);
      color: var(--color-text-muted);
      font-family: var(--font-display);
      font-size: 16px;
      font-weight: 600;
      letter-spacing: 1.6px;
      margin: 16px 12px 0 12px;
      padding-bottom: 5px;
      text-transform: uppercase;
      writing-mode: initial;
    }
    &-units {
      align-content: flex-start;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 12px;
      position: relative;
    }
  }
  &__bin-overlay {
    align-items: center;
    background-color: rgba(208, 87, 87, 0.08);
    bottom: 0;
    display: flex;
    justify-content: center;
    left: 0;
    pointer-events: none;
    position: absolute;
    right: 0;
    top: 0;
    transition: background-color 120ms ease-out;
    z-index: 999;

    &--active {
      background-color: rgba(208, 87, 87, 0.28);
    }
  }
  &__bin-label {
    background-color: var(--color-negative);
    border-radius: 4px;
    color: white;
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 1.2px;
    padding: 8px 18px;
    text-transform: uppercase;
  }
  &__no-units {
    color: var(--color-text-muted);
    font-family: var(--font-body);
    padding: 16px;
    writing-mode: initial;
  }
  &__blank {
    align-items: center;
    color: var(--color-text-muted);
    display: flex;
    flex-grow: 1;
    font-family: var(--font-body);
    font-size: 18px;
    justify-content: center;
    padding: 32px;
    text-align: center;

    b {
      color: var(--color-text);
    }
  }
}
</style>
