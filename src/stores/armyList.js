import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { save, restore } from "../utils/localStorage";
import { useMfmStore } from "./mfm";
import { useCodexStore } from "./codex";
import { unitMax } from "../utils/unit-max";
import { computeListPoints } from "../utils/list-points";
import { battleSizeRules } from "../utils/battle-size";
import { maxBipartiteMatching } from "../utils/bodyguard-matching";

export const useArmyListStore = defineStore("armyList", () => {
  const mfmStore = useMfmStore();
  const codexStore = useCodexStore();
  const name = ref("");
  const faction = ref("");
  const maxPoints = ref(2000);
  const mfm_version = ref("");
  const version = ref("");
  const modifiedDate = ref(Date.now());
  const sortOrder = ref("");
  const units = ref([]);
  const detachments = ref([]);

  const effectiveMaxPoints = computed(() => maxPoints.value);

  const currentMFM = computed(() => mfmStore.getVersion(mfm_version.value));

  const pointsBreakdown = computed(() => {
    return computeListPoints(toObject(), currentMFM.value, faction.value);
  });

  // Bodyguard validation: pre-compute a single bipartite matching over the
  // whole list so every Leader / Support unit knows whether there's a
  // bodyguard slot reserved for it. Per Core Rules 19.04 each bodyguard can
  // host one Leader plus one Support, so the two matchings are solved
  // independently.
  const bodyguardMatching = computed(() => {
    const leaderItems = [];
    const supportItems = [];
    const bodyguardCounts = {};

    for (const unit of units.value) {
      if (unit.bonus) continue;
      if (unit.name === "Enhancements") continue;
      const ds = codexStore.getDataSheet(unit.name);
      if (!ds) continue;

      if (ds.leader?.attachesTo?.length) {
        leaderItems.push({ id: unit.id, attachesTo: ds.leader.attachesTo });
      } else if (ds.support?.attachesTo?.length) {
        supportItems.push({ id: unit.id, attachesTo: ds.support.attachesTo });
      } else {
        bodyguardCounts[unit.name] = (bodyguardCounts[unit.name] || 0) + 1;
      }
    }

    const leaderMatched = maxBipartiteMatching(leaderItems, bodyguardCounts);
    const supportMatched = maxBipartiteMatching(supportItems, bodyguardCounts);

    const unmatchedLeaderIds = new Set();
    for (const item of leaderItems) {
      if (!leaderMatched.has(item.id)) unmatchedLeaderIds.add(item.id);
    }
    const unmatchedSupportIds = new Set();
    for (const item of supportItems) {
      if (!supportMatched.has(item.id)) unmatchedSupportIds.add(item.id);
    }

    return { unmatchedLeaderIds, unmatchedSupportIds };
  });

  const unitCounts = computed(() => {
    const counts = {};
    units.value.forEach((unit) => {
      if (!unit.bonus) {
        counts[unit.name] = (counts[unit.name] || 0) + 1;
      }
    });
    return counts;
  });

  const modelsTaken = computed(() => {
    const taken = {};
    units.value.forEach((unit) => {
      taken[unit.name] = (taken[unit.name] || 0) + (unit.models || 0);
    });
    return taken;
  });

  const enhancementsTaken = computed(() => {
    const taken = new Set();
    units.value.forEach((unit) => {
      if (unit.optionName) taken.add(unit.optionName);
    });
    return taken;
  });

  const totalEnhancementsCount = computed(() => {
    let count = 0;
    units.value.forEach((unit) => {
      const datasheet = codexStore.getDataSheet(unit.name);
      if (
        datasheet?.enhancements ||
        (!datasheet && unit.optionName && !unit.models)
      ) {
        count++;
      }
    });
    return count;
  });

  // Pool of legal enhancement names: union of every selected detachment's
  // enhancements, looked up directly on the faction record in the current
  // MFM data.
  function availableEnhancementNames() {
    const factionEntry = currentMFM.value?.FACTIONS?.find(
      (f) => f.name === faction.value
    );
    const names = [];
    for (const dName of detachments.value ?? []) {
      const meta = factionEntry?.detachments.find((d) => d.name === dName);
      for (const e of meta?.enhancements ?? []) names.push(e.name);
    }
    return names;
  }

  function getUnitValidationError(unit) {
    if (unit.error) return "Invalid Unit";

    const datasheet = codexStore.getDataSheet(unit.name);

    // Enhancement: identifiable either by `datasheet.enhancements` or by
    // having an optionName with no models and no resolvable datasheet.
    if (
      datasheet?.enhancements ||
      (!datasheet && unit.optionName && !unit.models)
    ) {
      const availableEnhancements = availableEnhancementNames();
      if (!availableEnhancements.includes(unit.optionName)) {
        return "Enhancement not available in this detachment";
      }

      // Battle-size enhancement cap (Incursion: 2, Strike Force: 4). Flag
      // whichever enhancements come after the cap is reached so the user
      // knows which to drop.
      const rules = battleSizeRules(toObject());
      if (rules) {
        const allEnhancementUnits = units.value.filter(
          (u) => u.name === "Enhancements"
        );
        const indexOfThis = allEnhancementUnits.findIndex(
          (u) => u.id === unit.id
        );
        if (indexOfThis >= rules.maxEnhancements) {
          return `Only ${rules.maxEnhancements} enhancements allowed in ${rules.label}`;
        }
      }

      return false;
    }

    const count = unitCounts.value[unit.name] || 0;

    if (!datasheet) {
      const version = currentMFM.value?.MFM_VERSION || "unknown";
      return `Unit not available in MFM ${version}`;
    }

    const points = mfmStore.getPoints(unit, currentMFM.value, faction.value);
    if (points === -1) {
      const version = currentMFM.value?.MFM_VERSION || "unknown";
      return `Unit not found in MFM ${version}`;
    }

    const max = unitMax(datasheet, toObject());
    if (count > max) return `Only ${max} of this unit allowed`;

    // Bodyguard requirement: every Leader and every Support unit must pair
    // with a bodyguard from its attaches-to list. Solved as bipartite
    // matching list-wide in `bodyguardMatching`; here we just look up
    // whether this specific unit instance got a slot.
    const { unmatchedLeaderIds, unmatchedSupportIds } = bodyguardMatching.value;
    if (unmatchedLeaderIds.has(unit.id)) {
      return `Leader needs a bodyguard from: ${datasheet.leader.attachesTo.join(
        ", "
      )}`;
    }
    if (unmatchedSupportIds.has(unit.id)) {
      return `Support needs a bodyguard from: ${datasheet.support.attachesTo.join(
        ", "
      )}`;
    }

    return false;
  }

  function addUnit(unit) {
    units.value = [unit, ...units.value];
    modifiedDate.value = Date.now();
  }

  function removeUnit(id) {
    units.value = units.value.filter((u) => u.id !== id);
    modifiedDate.value = Date.now();
  }

  function setUnits(newUnits) {
    units.value = newUnits;
  }

  function addDetachment(name) {
    if (!whyCantAddDetachment(name)) {
      detachments.value = [...detachments.value, name];
      modifiedDate.value = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Returns null if the detachment can be added, or a short reason string.
   * The codex card uses this both to disable the card visually and to
   * populate its tooltip. `addDetachment` and the drag-drop @add handler
   * use the same check so the engine and the UI agree.
   */
  function whyCantAddDetachment(name) {
    if (!name) return "Invalid detachment";
    if (detachments.value.includes(name)) return "Already added";

    const meta = findDetachmentMeta(name);
    if (!meta) return null;
    const cost = meta.dp ?? 0;

    const rules = battleSizeRules(toObject());
    const breakdown = pointsBreakdown.value.dp;

    // 3-DP detachments own the entire army.
    if (cost >= 3 && rules && !rules.allow3DpDetachment) {
      return `3-DP detachments require at least 2,000 points`;
    }
    if (cost >= 3 && detachments.value.length > 0) {
      return "3-DP detachments can't be combined with other detachments";
    }
    if (detachments.value.length > 0) {
      const existing = detachments.value
        .map(findDetachmentMeta)
        .find((d) => (d?.dp ?? 0) >= 3);
      if (existing) {
        return `Cannot add alongside a 3-DP detachment (${existing.name})`;
      }
    }

    if (breakdown && breakdown.used + cost > breakdown.max) {
      return "Not enough DP";
    }
    return null;
  }

  function canAddDetachment(name) {
    return whyCantAddDetachment(name) === null;
  }

  function findDetachmentMeta(name) {
    const factionEntry = currentMFM.value?.FACTIONS?.find(
      (f) => f.name === faction.value
    );
    return factionEntry?.detachments.find((d) => d.name === name) ?? null;
  }

  function removeDetachment(name) {
    if (!detachments.value.includes(name)) return false;
    setDetachments(detachments.value.filter((d) => d !== name));
    return true;
  }

  function setDetachments(arr) {
    const newArr = Array.isArray(arr) ? arr : [];
    const removed = detachments.value.filter((n) => !newArr.includes(n));
    detachments.value = newArr;

    // Cascade: enhancements from removed detachments leave too. Identified
    // by the explicit `detachment` tag set at add time, with a fallback
    // lookup against the current MFM data for older entries.
    if (removed.length > 0) {
      const factionEntry = currentMFM.value?.FACTIONS?.find(
        (f) => f.name === faction.value
      );
      const enhancementsByDet = new Map();
      for (const name of removed) {
        const meta = factionEntry?.detachments.find((d) => d.name === name);
        enhancementsByDet.set(
          name,
          new Set((meta?.enhancements ?? []).map((e) => e.name))
        );
      }

      units.value = units.value.filter((u) => {
        if (u.name !== "Enhancements") return true;
        if (u.detachment && removed.includes(u.detachment)) return false;
        for (const names of enhancementsByDet.values()) {
          if (names.has(u.optionName)) return false;
        }
        return true;
      });
    }

    modifiedDate.value = Date.now();
  }

  function setList(list) {
    name.value = list.name || "";
    faction.value = list.faction || "";
    maxPoints.value = list.maxPoints || 2000;
    mfm_version.value = list.mfm_version || "";
    version.value = list.version || "";
    modifiedDate.value = list.modifiedDate || Date.now();
    sortOrder.value = list.sortOrder || "";
    units.value = list.units || [];
    detachments.value = Array.isArray(list.detachments) ? list.detachments : [];
  }

  function toObject() {
    return {
      name: name.value,
      faction: faction.value,
      maxPoints: maxPoints.value,
      mfm_version: mfm_version.value,
      version: version.value,
      modifiedDate: modifiedDate.value,
      sortOrder: sortOrder.value,
      units: units.value,
      detachments: detachments.value,
    };
  }

  function loadFromStorage(defaultList = null) {
    const savedList = restore("currentList");
    if (savedList) setList(savedList);
    else if (defaultList) setList(defaultList);
  }

  watch(
    () => toObject(),
    (currentList) => save("currentList", currentList),
    { deep: true }
  );

  return {
    name,
    faction,
    maxPoints,
    mfm_version,
    version,
    modifiedDate,
    sortOrder,
    units,
    detachments,
    unitCounts,
    modelsTaken,
    enhancementsTaken,
    totalEnhancementsCount,
    effectiveMaxPoints,
    currentMFM,
    pointsBreakdown,
    getUnitValidationError,
    addUnit,
    removeUnit,
    setUnits,
    addDetachment,
    removeDetachment,
    setDetachments,
    canAddDetachment,
    whyCantAddDetachment,
    setList,
    toObject,
    loadFromStorage,
  };
});
