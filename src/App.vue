<script setup>
import { onMounted, onUnmounted, watch } from "vue";
import { useArmyListStore } from "./stores/armyList";
import { useCollectionStore } from "./stores/collection";
import { useMfmStore } from "./stores/mfm";
import { useCodexStore } from "./stores/codex";
import { useAppStore } from "./stores/app";
import { useDragStore } from "./stores/drag";
import ArmyList from "./components/ArmyList.vue";
import ArmyCodex from "./components/ArmyCodex.vue";
import DragGhost from "./components/DragGhost.vue";
import PrintableArmyList from "./components/PrintableArmyList.vue";
import { SORT_MANUAL } from "./data/constants";
import {
  sortDataSheetAlphabetical,
  sortListPoints,
  sortListByRole,
  sortTree,
} from "./utils/sort-functions";
import AppToolBar from "./components/AppToolBar.vue";
import CodexToolBar from "./components/CodexToolBar.vue";
import VersionBar from "./components/VersionBar.vue";
import { deserializeList, serializeList } from "./utils/serialize-list";

const armyListStore = useArmyListStore();
const collectionStore = useCollectionStore();
const mfmStore = useMfmStore();
const codexStore = useCodexStore();
const appStore = useAppStore();
const dragStore = useDragStore();

function initializeApp() {
  armyListStore.loadFromStorage();
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
  }
}

initializeApp();

const handleResize = () => {
  appStore.setAppDimensions(window.innerHeight, window.innerWidth);
};

function applySortToList() {
  const sortOrder = armyListStore.sortOrder || SORT_MANUAL;
  if (sortOrder === SORT_MANUAL) return;

  const all = armyListStore.units;
  let cmp;
  if (sortOrder === "A-Z") {
    cmp = sortDataSheetAlphabetical;
  } else if (sortOrder === "Expensive first") {
    cmp = sortListPoints(mfmStore, armyListStore.currentMFM, all, false);
  } else if (sortOrder === "Cheap first") {
    cmp = sortListPoints(mfmStore, armyListStore.currentMFM, all, true);
  } else if (sortOrder === "By Role") {
    cmp = sortListByRole(codexStore.getDataSheet);
  } else {
    return;
  }
  armyListStore.setUnits(sortTree(all, cmp));
}

// Wire the drag store to the army list store and to window-level pointer /
// keyboard events while a drag is in flight. The drag store owns hit-test +
// active-slot resolution; this watcher only handles "OS-level" inputs and
// the commit dispatch — no DnD logic of its own.
let pointerMoveHandler = null;
let pointerUpHandler = null;
let pointerCancelHandler = null;
let keyDownHandler = null;

function detachDragListeners() {
  if (pointerMoveHandler) {
    window.removeEventListener("pointermove", pointerMoveHandler);
    window.removeEventListener("pointerup", pointerUpHandler);
    window.removeEventListener("pointercancel", pointerCancelHandler);
    window.removeEventListener("keydown", keyDownHandler);
    pointerMoveHandler = null;
    pointerUpHandler = null;
    pointerCancelHandler = null;
    keyDownHandler = null;
  }
}

watch(
  () => dragStore.draggedId,
  (id) => {
    if (id && !pointerMoveHandler) {
      pointerMoveHandler = (e) =>
        dragStore.updatePointer(e.clientX, e.clientY);
      pointerUpHandler = () => {
        const result = dragStore.commit();
        if (!result) return;
        if (result.type === "reorder") {
          armyListStore.sortOrder = SORT_MANUAL;
          armyListStore.moveUnit(
            result.draggedId,
            result.parentId,
            result.index
          );
        } else if (result.type === "attach") {
          armyListStore.sortOrder = SORT_MANUAL;
          armyListStore.moveUnit(result.draggedId, result.hostId);
        } else if (result.type === "bin") {
          // Dragging-to-trash means "delete the whole thing" — take the
          // dragged unit plus any attached subtree with it. removeUnit's
          // orphan-children behavior stays for non-drag delete paths.
          armyListStore.removeUnitSubtree(result.draggedId);
        }
      };
      pointerCancelHandler = () => dragStore.cancel();
      keyDownHandler = (e) => {
        if (e.key === "Escape") dragStore.cancel();
      };
      window.addEventListener("pointermove", pointerMoveHandler);
      window.addEventListener("pointerup", pointerUpHandler);
      window.addEventListener("pointercancel", pointerCancelHandler);
      window.addEventListener("keydown", keyDownHandler);
    } else if (!id) {
      detachDragListeners();
    }
  }
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

// Mirror the current list into the address bar via replaceState so the user
// can just copy the URL to share. Skip empty/factionless lists to avoid
// `?n=&f=&…` on a fresh app. replaceState (not pushState) — every keystroke
// in the list name shouldn't add a browser-history entry.
watch(
  () => armyListStore.toObject(),
  (list) => {
    if (!list.faction) return;
    const url = window.location.pathname + serializeList(list);
    window.history.replaceState({}, "", url);
  },
  { deep: true }
);

onMounted(() => {
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  detachDragListeners();
});
</script>

<template>
  <div class="app">
    <AppToolBar class="app__toolbar" />
    <CodexToolBar v-if="armyListStore.faction" class="app__codex-toolbar" />
    <div class="app__body" :class="{ 'app__body--blank': !armyListStore.faction }">
      <ArmyList v-if="armyListStore.faction" />
      <ArmyCodex />
    </div>
    <VersionBar />
    <!--
      Mounted inside .app so the ghost can resolve the CSS variables
      (--color-header, --color-accent, etc.) defined on the .app scope.
      Position: fixed escapes .app's overflow: hidden anyway.
    -->
    <DragGhost />
  </div>
  <PrintableArmyList class="print" />
</template>

<style scoped lang="scss">
.app {
  --color-bg: #0f1923;
  --color-surface: #1a2332;
  --color-header: #243447;
  --color-divider: #2e3e54;
  --color-text: #e6ecf2;
  --color-text-muted: #8a9bb0;
  --color-accent: #e8a23a;
  --color-accent-dim: #b07a26;
  --color-positive: #5fbf7a;
  --color-negative: #d05757;
  --font-display: "Oswald", "Impact", system-ui, sans-serif;
  --font-body: "Inter", system-ui, "Segoe UI", sans-serif;
  --font-family: var(--font-body);
  --toolbar-height: 44px;
  --codex-toolbar-height: 64px;
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
  position: relative;
  overflow: hidden;

  &__toolbar {
    height: var(--toolbar-height);
  }

  &__codex-toolbar {
    height: var(--codex-toolbar-height);
  }

  &__body {
    display: flex;
    height: calc(100svh - var(--toolbar-height) - var(--codex-toolbar-height) - 20px);
    justify-content: center;
    position: relative;
    z-index: 1;

    &--blank {
      height: calc(100svh - var(--toolbar-height) - 20px);
    }
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
