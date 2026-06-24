import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { save, restore, debouncedSave } from "../utils/localStorage";
import { GROUP_ROLE, SORT_MANUAL } from "../data/constants";
import { useArmyListStore } from "./armyList";
import { useMfmStore } from "./mfm";
import PACKAGE from "../../package.json";

export const useAppStore = defineStore("app", () => {
  const appHeight = ref(window.innerHeight);
  const appWidth = ref(window.innerWidth);

  const codexFilter = ref("");
  const editCollection = ref(restore("editCollection") ?? false);
  // Role is now the only supported grouping; coerce any legacy "None" value
  // saved by older clients so the existing UI doesn't render against an
  // unsupported state.
  const savedGroup = restore("group");
  const group = ref(savedGroup === GROUP_ROLE ? savedGroup : GROUP_ROLE);
  const sortOrder = ref(restore("sortOrder") ?? "A-Z");

  const showLegends = ref(restore("showLegends") ?? false);
  const showPointsChanges = ref(restore("showPointsChanges") ?? false);
  const showKeywords = ref(restore("showKeywords") ?? false);
  // The single source of truth for the "Bypass restrictions" switch and every
  // add/attach gate. Driven three ways (see App.vue): a click toggles it,
  // pressing Ctrl/Cmd forces it on, releasing forces it off.
  const freeAttach = ref(restore("freeAttach") ?? false);
  // Tracks whether the bypass modifier is currently held so App.vue can drive
  // `freeAttach` on the press/release *transitions* only — and not clobber a
  // click made mid-hold. Transient; not persisted.
  const bypassKeyHeld = ref(false);

  // Bypass Restrictions / Edit Collection live inline in the codex toolbar when
  // it's wide enough, and fall back into the Options dropdown otherwise. Driving
  // this from one reactive flag keeps the two render sites mutually exclusive —
  // a pair of opposing CSS media queries collides with ToggleSwitch's own
  // `display` and can leave both copies visible.
  const inlineCodexToggles = computed(() => appWidth.value >= 1536);

  const lists = ref(restore("lists") ?? []);

  watch(editCollection, (newValue) => save("editCollection", newValue));
  watch(group, (newGroup) => save("group", newGroup));
  watch(sortOrder, (newSortOrder) => save("sortOrder", newSortOrder));
  watch(showLegends, (newValue) => save("showLegends", newValue));
  watch(showPointsChanges, (newValue) => save("showPointsChanges", newValue));
  watch(showKeywords, (newValue) => save("showKeywords", newValue));
  watch(freeAttach, (newValue) => save("freeAttach", newValue));
  watch(lists, (newLists) => debouncedSave("lists", newLists), { deep: true });

  function setAppDimensions(height, width) {
    appHeight.value = height;
    appWidth.value = width;
  }

  function createNewList(faction) {
    const mfmStore = useMfmStore();
    const current = mfmStore.MFM.CURRENT;
    return {
      faction: faction || current?.FACTIONS?.[0]?.name || "",
      maxPoints: 2000,
      mfm_version: current?.MFM_VERSION || "",
      modifiedDate: Date.now(),
      name: "",
      sortOrder: SORT_MANUAL,
      units: [],
      version: PACKAGE.version,
      detachments: [],
    };
  }

  function newList(faction) {
    const armyListStore = useArmyListStore();
    if (armyListStore.faction) {
      lists.value.unshift(armyListStore.toObject());
    }
    armyListStore.setList(createNewList(faction));
  }

  function selectList(list) {
    const armyListStore = useArmyListStore();
    const i = lists.value.indexOf(list);
    lists.value.splice(i, 1);
    if (armyListStore.faction) {
      lists.value.unshift(armyListStore.toObject());
    }
    armyListStore.setList(list);
  }

  function copyList(list) {
    const armyListStore = useArmyListStore();
    const currentList = armyListStore.toObject();
    const i =
      JSON.stringify(list) === JSON.stringify(currentList)
        ? 0
        : lists.value.indexOf(list);
    const clone = JSON.parse(JSON.stringify(list));
    lists.value.splice(i, 0, clone);
  }

  function deleteList(list) {
    const i = lists.value.indexOf(list);
    lists.value.splice(i, 1);
  }

  return {
    appHeight,
    appWidth,
    codexFilter,
    editCollection,
    group,
    sortOrder,
    showLegends,
    showPointsChanges,
    showKeywords,
    freeAttach,
    bypassKeyHeld,
    inlineCodexToggles,
    lists,
    setAppDimensions,
    createNewList,
    newList,
    selectList,
    copyList,
    deleteList,
  };
});
