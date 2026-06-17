<script setup>
import { onMounted, onUnmounted, watch } from "vue";
import { useArmyListStore } from "./stores/armyList";
import { useCollectionStore } from "./stores/collection";
import { useMfmStore } from "./stores/mfm";
import { useCodexStore } from "./stores/codex";
import { useAppStore } from "./stores/app";
import ArmyList from "./components/ArmyList.vue";
import ArmyCodex from "./components/ArmyCodex.vue";
import PrintableArmyList from "./components/PrintableArmyList.vue";
import { SORT_MANUAL } from "./data/constants";
import {
  sortDataSheetAlphabetical,
  sortListPoints,
  sortListByRole,
} from "./utils/sort-functions";
import AppToolBar from "./components/AppToolBar.vue";
import CodexToolBar from "./components/CodexToolBar.vue";
import VersionBar from "./components/VersionBar.vue";
import { deserializeList } from "./utils/serialize-list";

const armyListStore = useArmyListStore();
const collectionStore = useCollectionStore();
const mfmStore = useMfmStore();
const codexStore = useCodexStore();
const appStore = useAppStore();

function initializeApp() {
  const defaultList = appStore.createNewList();
  armyListStore.loadFromStorage(defaultList);
  collectionStore.loadFromStorage();

  // Auto-upgrade the current list and each saved list to the latest MFM
  // version when their points are unchanged.
  [armyListStore.toObject(), ...appStore.lists].forEach((list) => {
    mfmStore.autoUpgradeMFMVersion(list);
  });

  codexStore.setFaction(armyListStore.faction);
  codexStore.setCurrentMFM(armyListStore.currentMFM);

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.size) {
    try {
      const list = deserializeList(searchParams);
      appStore.lists.unshift(armyListStore.toObject());
      armyListStore.setList(list);
    } catch (e) {
      console.error(e);
    }
    if (history.pushState) {
      const url =
        window.location.protocol +
        "//" +
        window.location.host +
        window.location.pathname;
      window.history.pushState({ path: url }, "", url);
    }
  }
}

initializeApp();

const handleResize = () => {
  appStore.setAppDimensions(window.innerHeight, window.innerWidth);
};

function applySortToList() {
  const sortOrder = armyListStore.sortOrder || SORT_MANUAL;
  if (sortOrder === SORT_MANUAL) return;

  const units = [...armyListStore.units];
  if (sortOrder === "A-Z") {
    units.sort(sortDataSheetAlphabetical);
  } else if (sortOrder === "Expensive first") {
    units.sort(sortListPoints(mfmStore, armyListStore.currentMFM, false));
  } else if (sortOrder === "Cheap first") {
    units.sort(sortListPoints(mfmStore, armyListStore.currentMFM, true));
  } else if (sortOrder === "By Role") {
    units.sort(sortListByRole(codexStore.getDataSheet));
  }
  armyListStore.setUnits(units);
}

watch(
  () => appStore.bin,
  () => appStore.bin.splice(0)
);

watch(
  () => armyListStore.faction,
  (newFaction) => {
    appStore.codexFilter = "";
    appStore.editCollection = false;
    codexStore.setFaction(newFaction);
  }
);

watch(
  () => armyListStore.currentMFM,
  (newMFM) => {
    codexStore.setCurrentMFM(newMFM);
  }
);

watch(
  () => armyListStore.units.length,
  () => applySortToList()
);

watch(
  () => armyListStore.sortOrder,
  () => applySortToList()
);

onMounted(() => {
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});
</script>

<template>
  <div class="app">
    <AppToolBar class="app__toolbar" />
    <CodexToolBar class="app__codex-toolbar" />
    <div class="app__body">
      <ArmyList />
      <ArmyCodex />
    </div>
    <VersionBar />
  </div>
  <PrintableArmyList class="print" />
</template>

<style scoped lang="scss">
.app {
  --font-family: Calibri, sans-serif;
  --toolbar-height: 44px;
  background-color: #111;
  font-family: var(--font-family);
  position: relative;
  overflow: hidden;

  &__toolbar {
    height: var(--toolbar-height);
  }

  &__codex-toolbar {
    height: var(--toolbar-height);
  }

  &__body {
    display: flex;
    height: calc(100svh - (var(--toolbar-height) * 2) - 20px);
    justify-content: center;
    position: relative;
    z-index: 1;
  }
}

.print {
  display: none;
  font-family: monospace;
}

@media print {
  .app {
    display: none;
  }
  .print {
    display: block;
  }
}
</style>
