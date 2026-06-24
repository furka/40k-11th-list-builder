<script setup>
import { onMounted, onUnmounted, watch } from "vue";
import { useArmyListStore } from "./stores/armyList";
import { useCollectionStore } from "./stores/collection";
import { useMfmStore } from "./stores/mfm";
import { useCodexStore } from "./stores/codex";
import { useAppStore } from "./stores/app";
import { useDragStore } from "./stores/drag";
import { useDetachmentDragStore } from "./stores/detachmentDrag";
import ArmyList from "./components/ArmyList.vue";
import ArmyCodex from "./components/ArmyCodex.vue";
import DragGhost from "./components/DragGhost.vue";
import DetachmentDragGhost from "./components/DetachmentDragGhost.vue";
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
import { deserializeList } from "./utils/serialize-list";

const armyListStore = useArmyListStore();
const collectionStore = useCollectionStore();
const mfmStore = useMfmStore();
const codexStore = useCodexStore();
const appStore = useAppStore();
const dragStore = useDragStore();
const detachmentDragStore = useDetachmentDragStore();

function initializeApp() {
  armyListStore.loadFromStorage();
  collectionStore.loadFromStorage();

  // Auto-upgrade the current list and each saved list to the latest MFM
  // version when their points are unchanged.
  [armyListStore.toObject(), ...appStore.lists].forEach((list) => {
    mfmStore.autoUpgradeMFMVersion(list);
  });

  codexStore.setFaction(armyListStore.faction);
  codexStore.setAllies(armyListStore.allies);
  codexStore.setCurrentMFM(armyListStore.currentMFM);

  // URL search params are only ever an incoming shared list — import it
  // once, then strip the params so a refresh can't re-trigger the import.
  // Sharing-out is handled on demand by ShareListModal, not via auto-mirror.
  if (window.location.search) {
    try {
      const list = deserializeList(new URLSearchParams(window.location.search));
      if (armyListStore.faction) {
        appStore.lists.unshift(armyListStore.toObject());
      }
      armyListStore.setList(list);
    } catch (e) {
      console.error(e);
    }
    window.history.replaceState({}, "", window.location.pathname);
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
let keyUpHandler = null;

function detachDragListeners() {
  if (pointerMoveHandler) {
    window.removeEventListener("pointermove", pointerMoveHandler);
    window.removeEventListener("pointerup", pointerUpHandler);
    window.removeEventListener("pointercancel", pointerCancelHandler);
    window.removeEventListener("keydown", keyDownHandler);
    window.removeEventListener("keyup", keyUpHandler);
    pointerMoveHandler = null;
    pointerUpHandler = null;
    pointerCancelHandler = null;
    keyDownHandler = null;
    keyUpHandler = null;
  }
}

// Ctrl (Windows/Linux) or Cmd (Mac) held during a drag bypasses attachment
// restrictions for that drop — a transient mirror of the "Bypass restrictions"
// toggle.
const isBypassModifier = (e) => e.ctrlKey || e.metaKey;

let detachmentPointerMoveHandler = null;
let detachmentPointerUpHandler = null;
let detachmentPointerCancelHandler = null;
let detachmentKeyDownHandler = null;

function detachDetachmentDragListeners() {
  if (detachmentPointerMoveHandler) {
    window.removeEventListener("pointermove", detachmentPointerMoveHandler);
    window.removeEventListener("pointerup", detachmentPointerUpHandler);
    window.removeEventListener("pointercancel", detachmentPointerCancelHandler);
    window.removeEventListener("keydown", detachmentKeyDownHandler);
    detachmentPointerMoveHandler = null;
    detachmentPointerUpHandler = null;
    detachmentPointerCancelHandler = null;
    detachmentKeyDownHandler = null;
  }
}

watch(
  () => dragStore.draggedId,
  (id) => {
    if (id && !pointerMoveHandler) {
      pointerMoveHandler = (e) => {
        dragStore.setBypass(isBypassModifier(e));
        dragStore.updatePointer(e.clientX, e.clientY);
      };
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
          armyListStore.moveUnit(
            result.draggedId,
            result.hostId,
            undefined,
            result.forced
          );
        } else if (result.type === "bin") {
          // Dragging-to-trash means "delete the whole thing" — take the
          // dragged unit plus any attached subtree with it. removeUnit's
          // orphan-children behavior stays for non-drag delete paths.
          armyListStore.removeUnitSubtree(result.draggedId);
        }
      };
      pointerCancelHandler = () => dragStore.cancel();
      keyDownHandler = (e) => {
        if (e.key === "Escape") {
          dragStore.cancel();
          return;
        }
        dragStore.setBypass(isBypassModifier(e));
      };
      keyUpHandler = (e) => dragStore.setBypass(isBypassModifier(e));
      window.addEventListener("pointermove", pointerMoveHandler);
      window.addEventListener("pointerup", pointerUpHandler);
      window.addEventListener("pointercancel", pointerCancelHandler);
      window.addEventListener("keydown", keyDownHandler);
      window.addEventListener("keyup", keyUpHandler);
    } else if (!id) {
      detachDragListeners();
    }
  }
);

// Parallel wiring for the detachment drag store. Separate from the unit drag
// because their state shapes don't overlap (units have ids, attach semantics,
// depth limits; detachments are a flat ordered list).
watch(
  () => detachmentDragStore.draggedName,
  (name) => {
    if (name && !detachmentPointerMoveHandler) {
      detachmentPointerMoveHandler = (e) =>
        detachmentDragStore.updatePointer(e.clientX, e.clientY);
      detachmentPointerUpHandler = () => {
        const result = detachmentDragStore.commit();
        if (!result) return;
        if (result.type === "detachment-bin") {
          armyListStore.removeDetachment(result.draggedName);
          return;
        }
        const arr = armyListStore.detachments.slice();
        arr.splice(result.fromIndex, 1);
        const adjusted =
          result.toIndex > result.fromIndex
            ? result.toIndex - 1
            : result.toIndex;
        arr.splice(adjusted, 0, result.draggedName);
        armyListStore.setDetachments(arr);
      };
      detachmentPointerCancelHandler = () => detachmentDragStore.cancel();
      detachmentKeyDownHandler = (e) => {
        if (e.key === "Escape") detachmentDragStore.cancel();
      };
      window.addEventListener("pointermove", detachmentPointerMoveHandler);
      window.addEventListener("pointerup", detachmentPointerUpHandler);
      window.addEventListener("pointercancel", detachmentPointerCancelHandler);
      window.addEventListener("keydown", detachmentKeyDownHandler);
    } else if (!name) {
      detachDetachmentDragListeners();
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
  () => armyListStore.allies,
  (newAllies) => {
    codexStore.setAllies(newAllies);
  },
  { deep: true }
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

// Track the bypass modifier globally (outside of any drag) so the codex can
// live-update its disabled styling — rows blocked only by a unit's max are
// addable while Ctrl/Cmd is held, so they shouldn't look disabled then.
const updateBypassKey = (e) => {
  appStore.bypassKeyHeld = isBypassModifier(e);
};
// A window blur can swallow the keyup (e.g. Alt-Tab while holding Ctrl), so
// reset on blur to avoid the styling getting stuck in the bypassed state.
const clearBypassKey = () => {
  appStore.bypassKeyHeld = false;
};

onMounted(() => {
  window.addEventListener("resize", handleResize);
  window.addEventListener("keydown", updateBypassKey);
  window.addEventListener("keyup", updateBypassKey);
  window.addEventListener("blur", clearBypassKey);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("keydown", updateBypassKey);
  window.removeEventListener("keyup", updateBypassKey);
  window.removeEventListener("blur", clearBypassKey);
  detachDragListeners();
  detachDetachmentDragListeners();
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
    <DetachmentDragGhost />
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
  --codex-toolbar-height: 50px;
  --version-bar-height: 22px;
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
    height: calc(100svh - var(--toolbar-height) - var(--codex-toolbar-height) - var(--version-bar-height));
    justify-content: center;
    position: relative;
    z-index: 1;

    &--blank {
      height: calc(100svh - var(--toolbar-height) - var(--version-bar-height));
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
