import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useMfmStore } from "./mfm";
import { useAppStore } from "./app";
import { nameEquals, normalizeString } from "../utils/name-match";
import {
  sortDataSheetAlphabetical,
  sortDataSheetPtsAscending,
  sortDataSheetPtsDescending,
} from "../utils/sort-functions";
import { SORT_CHEAPEST_FIRST, SORT_EXPENSIVE_FIRST } from "../data/constants";
import { matchesDatasheet, matchesDetachment } from "../utils/codex-filter";

export const useCodexStore = defineStore("codex", () => {
  const mfmStore = useMfmStore();
  const appStore = useAppStore();

  const faction = ref(null);
  const allies = ref([]);
  const currentMFM = ref(null);

  const compendium = computed(() => {
    return (currentMFM.value || mfmStore.MFM.CURRENT)?.DATA_SHEETS ?? [];
  });

  const compendiumByName = computed(() => {
    const factionMap = new Map();
    const allUnitsMap = new Map();

    compendium.value.forEach((sheet) => {
      const normalizedName = normalizeString(sheet.name);
      if (sheet.faction === faction.value) {
        factionMap.set(normalizedName, sheet);
      }
      allUnitsMap.set(normalizedName, sheet);
    });

    return { factionMap, allUnitsMap };
  });

  const filteredCompendium = computed(() => {
    const alliedSet = new Set(allies.value ?? []);

    let sheets = compendium.value.filter(
      (unit) =>
        unit.faction === faction.value || alliedSet.has(unit.faction)
    );

    if (appStore.codexFilter) {
      sheets = sheets.filter((sheet) =>
        matchesDatasheet(sheet, appStore.codexFilter)
      );
    }

    if (!appStore.showLegends) {
      sheets = sheets.filter((sheet) => !sheet.legends);
    }

    if (appStore.sortOrder === SORT_EXPENSIVE_FIRST) {
      sheets = [...sheets].sort(sortDataSheetPtsDescending);
    } else if (appStore.sortOrder === SORT_CHEAPEST_FIRST) {
      sheets = [...sheets].sort(sortDataSheetPtsAscending);
    } else {
      sheets = [...sheets].sort(sortDataSheetAlphabetical);
    }

    // Tag allied sheets so the codex card and the add-unit path can branch
    // on a stable field. Shallow-clone instead of mutating the parsed
    // compendium (which is deep-frozen elsewhere).
    return sheets.map((s) =>
      alliedSet.has(s.faction) && s.faction !== faction.value
        ? { ...s, allied: true, alliedFaction: s.faction }
        : s
    );
  });

  const filteredDetachments = computed(() => {
    const factionEntry = (currentMFM.value || mfmStore.MFM.CURRENT)?.FACTIONS?.find(
      (f) => f.name === faction.value
    );
    const all = factionEntry?.detachments ?? [];
    return all.filter((d) => matchesDetachment(d, appStore.codexFilter));
  });

  // 11th edition's enhancements are nested in their parent detachment cards
  // in the codex, not exposed as a flat "Enhancements" group. This getter
  // stays as the synthetic Enhancements datasheet for any code that still
  // looks it up by name (validation, points lookup), but with no filtering.
  const enhancements = computed(() => {
    const enhancementsSheet = compendium.value.find((sheet) =>
      nameEquals(sheet.name, "Enhancements")
    );
    return (
      enhancementsSheet ?? {
        name: "Enhancements",
        sizes: [],
        enhancements: true,
      }
    );
  });

  function setFaction(newFaction) {
    faction.value = newFaction;
  }

  function setAllies(newAllies) {
    allies.value = Array.isArray(newAllies) ? [...newAllies] : [];
  }

  function setCurrentMFM(mfm) {
    currentMFM.value = mfm;
  }

  function getDataSheet(unitName) {
    if (nameEquals(unitName, "Enhancements")) return enhancements.value;
    const normalized = normalizeString(unitName);
    return (
      compendiumByName.value.factionMap.get(normalized) ||
      compendiumByName.value.allUnitsMap.get(normalized)
    );
  }

  return {
    faction,
    allies,
    currentMFM,
    compendium,
    compendiumByName,
    filteredCompendium,
    filteredDetachments,
    enhancements,
    setFaction,
    setAllies,
    setCurrentMFM,
    getDataSheet,
  };
});
