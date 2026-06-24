<script setup>
import DataSheet from "./DataSheet.vue";
import CodexDetachmentCard from "./CodexDetachmentCard.vue";
import BattlelineOverridesModal from "./BattlelineOverridesModal.vue";
import { computed, ref } from "vue";
import { useArmyListStore } from "../stores/armyList";
import { useCodexStore } from "../stores/codex";
import { useDragStore } from "../stores/drag";
import { useDetachmentDragStore } from "../stores/detachmentDrag";
import { useSlotEl } from "../composables/useSlotEl";
import { useDetachmentSlotEl } from "../composables/useDetachmentSlotEl";
import { isBattleLine } from "../utils/is-battleline";
import { isDedicatedTransport } from "../utils/is-dedicated-transport";
import { hasKeyword } from "../utils/keywords";
import SettingsIcon from "../assets/setting-fill-icon.svg";

const armyListStore = useArmyListStore();
const codexStore = useCodexStore();
const dragStore = useDragStore();
const detachmentDragStore = useDetachmentDragStore();

const battlelineModalOpen = ref(false);

// Group primary datasheets first, then one labelled section per allied
// faction. Ally section titles are prefixed with the faction name so the
// user can tell whose units they're looking at. `list` is the active army
// list snapshot — used by isBattleLine to absorb detachment-conditional
// grants and the user's bonusBattleline overrides into the BATTLELINE
// keyword check.
function buildGroupsForScope(sheets, scopeTitle, list) {
  const prefix = scopeTitle ? `${scopeTitle} — ` : "";
  const characters = { kind: "characters", title: `${prefix}Characters`, units: [] };
  const battleLine = { kind: "battleLine", title: `${prefix}Battle Line`, units: [] };
  const transports = { kind: "transports", title: `${prefix}Dedicated Transport`, units: [] };
  const other = { kind: "other", title: `${prefix}Other`, units: [] };
  const fortifications = { kind: "fortifications", title: `${prefix}Fortifications`, units: [] };
  for (const sheet of sheets) {
    if (hasKeyword(sheet, "CHARACTER")) characters.units.push(sheet);
    else if (isBattleLine(sheet, list)) battleLine.units.push(sheet);
    else if (isDedicatedTransport(sheet)) transports.units.push(sheet);
    else if (hasKeyword(sheet, "FORTIFICATION")) fortifications.units.push(sheet);
    else other.units.push(sheet);
  }
  return [characters, battleLine, transports, other, fortifications];
}

const groupedUnits = computed(() => {
  const all = codexStore.filteredCompendium;
  const list = armyListStore.toObject();
  const primary = all.filter((s) => !s.allied);
  const alliesOrder = armyListStore.allies ?? [];
  const byAlly = new Map(alliesOrder.map((name) => [name, []]));
  for (const sheet of all) {
    if (!sheet.allied) continue;
    if (!byAlly.has(sheet.alliedFaction)) byAlly.set(sheet.alliedFaction, []);
    byAlly.get(sheet.alliedFaction).push(sheet);
  }

  const groups = [];
  groups.push(...buildGroupsForScope(primary, "", list));
  for (const [faction, sheets] of byAlly) {
    groups.push(...buildGroupsForScope(sheets, faction, list));
  }
  // Keep primary Battle Line visible (with its cogwheel) even when empty, so
  // users can open the override modal to mark a unit as Battleline.
  return groups.filter(
    (group) =>
      group.units.length > 0 ||
      (group.kind === "battleLine" && !group.title.includes(" — "))
  );
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
        Hit <b>New</b> to pick a faction. <span class="codex__blank-arrow" aria-hidden="true">&uarr;</span>
      </p>
    </div>
    <template v-else>
    <div class="codex__mfm" @wheel="onScrollWheel" ref="codexEl">
      <template v-if="codexStore.filteredCompendium.length > 0">
        <div class="codex__group" v-for="group in groupedUnits">
          <h2 class="codex__group-title" v-if="group.title">
            <span>{{ group.title }}</span>
            <button
              v-if="group.kind === 'battleLine' && !group.title.includes(' — ')"
              type="button"
              class="codex__group-cog"
              v-tooltip="'Edit Battleline overrides'"
              @click="battlelineModalOpen = true"
            >
              <SettingsIcon class="codex__group-cog-icon" />
            </button>
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
    <BattlelineOverridesModal
      v-if="battlelineModalOpen"
      @close="battlelineModalOpen = false"
    />
  </div>
</template>

<style scoped lang="scss">
.codex {
  background-color: #000;
  color: var(--color-text);
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-height: 0;
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
      align-items: center;
      border-bottom: 1px solid var(--color-divider);
      color: var(--color-text-muted);
      display: flex;
      font-family: var(--font-display);
      font-size: 16px;
      font-weight: 600;
      gap: 8px;
      letter-spacing: 1.6px;
      margin: 16px 12px 0 12px;
      padding-bottom: 5px;
      text-transform: uppercase;
      writing-mode: initial;
    }
    &-cog {
      align-items: center;
      background: transparent;
      border: none;
      color: var(--color-text);
      cursor: pointer;
      display: inline-flex;
      flex: 0 0 auto;
      justify-content: center;
      // Push to the inline-end of the title bar (right edge of the column).
      margin-inline-start: auto;
      padding: 0;

      &:hover {
        color: var(--color-accent);
      }
    }
    &-cog-icon {
      fill: currentColor;
      height: 18px;
      width: 18px;
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
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: 16px;
    padding: 12px 110px 0 0;
    position: absolute;
    right: 0;
    text-align: right;
    top: 0;

    p {
      margin: 0;
    }

    b {
      color: var(--color-text);
    }
  }
  &__blank-arrow {
    color: var(--color-accent);
    display: inline-block;
    font-size: 22px;
    line-height: 1;
    margin-left: 4px;
    transform: translateY(2px);
  }
}
</style>
