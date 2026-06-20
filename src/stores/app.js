import { defineStore } from "pinia";
import { ref, watch } from "vue";
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
  const group = ref(restore("group") ?? GROUP_ROLE);
  const sortOrder = ref(restore("sortOrder") ?? "A-Z");

  const showLegends = ref(restore("showLegends") ?? false);
  const showAvailableOnly = ref(restore("showAvailableOnly") ?? false);
  const showPointsChanges = ref(restore("showPointsChanges") ?? false);

  const lists = ref(restore("lists") ?? []);

  watch(editCollection, (newValue) => save("editCollection", newValue));
  watch(group, (newGroup) => save("group", newGroup));
  watch(sortOrder, (newSortOrder) => save("sortOrder", newSortOrder));
  watch(showLegends, (newValue) => save("showLegends", newValue));
  watch(showAvailableOnly, (newValue) => save("showAvailableOnly", newValue));
  watch(showPointsChanges, (newValue) => save("showPointsChanges", newValue));
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
    showAvailableOnly,
    showPointsChanges,
    lists,
    setAppDimensions,
    createNewList,
    newList,
    selectList,
    copyList,
    deleteList,
  };
});
