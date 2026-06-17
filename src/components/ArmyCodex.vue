<script setup>
import DataSheet from "./DataSheet.vue";
import draggable from "vuedraggable";
import ArmyListUnit from "./ArmyListUnit.vue";
import CodexDetachmentCard from "./CodexDetachmentCard.vue";
import { computed, ref } from "vue";
import { useArmyListStore } from "../stores/armyList";
import { useCodexStore } from "../stores/codex";
import { useAppStore } from "../stores/app";
import { GROUP_NONE } from "../data/constants";
import { isBattleLine } from "../utils/is-battleline";
import { isDedicatedTransport } from "../utils/is-dedicated-transport";

const armyListStore = useArmyListStore();
const codexStore = useCodexStore();
const appStore = useAppStore();

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

const detachmentList = computed(() => {
  const factionEntry = armyListStore.currentMFM?.FACTIONS?.find(
    (f) => f.name === armyListStore.faction
  );
  return factionEntry?.detachments ?? [];
});

function removeUnit(value) {
  appStore.bin = value;
}

// horizontal scroll using scrollwheel
const codexEl = ref(null);
function onScrollWheel(e) {
  e.preventDefault();
  codexEl.value.scrollLeft += e.deltaY;
}
</script>

<template>
  <div class="codex">
    <!--
      Draggable bin: dragging a unit or a detachment from the army list onto
      the codex area drops it here, which removes it from the army list (the
      source draggable's update:model-value fires with the smaller array, and
      setDetachments cascades any enhancement removals).
    -->
    <draggable
      :model-value="appStore.bin"
      @update:model-value="removeUnit"
      :group="{ name: 'bin', put: ['units', 'detachments'] }"
      animation="150"
      item-key="id"
      class="codex__bin"
    >
      <template #item="{ element, index }">
        <ArmyListUnit :unit="element" :index="index" :scale="scale" />
      </template>
    </draggable>
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
        <draggable
          :model-value="detachmentList"
          :group="{ name: 'detachments', pull: 'clone', put: false }"
          :sort="false"
          item-key="name"
          animation="150"
          class="codex__group-units"
          @update:model-value="() => {}"
        >
          <template #item="{ element }">
            <CodexDetachmentCard :detachment="element" />
          </template>
        </draggable>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.codex {
  background-color: #fff;
  background-image: url(../assets/bg.png);
  background-size: 100% 100%;
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
      font-size: 18px;
      margin: 12px 12px 0 12px;
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
  &__bin {
    bottom: 0;
    left: 0;
    pointer-events: none;
    position: absolute;
    right: 0;
    top: 0;
  }
  &__no-units {
    padding: 12px;
    writing-mode: initial;
  }
}
</style>
