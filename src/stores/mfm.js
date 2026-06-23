import { defineStore } from "pinia";
import { load11thMFM } from "../data/munitorum-field-manual-11th";
import { resolveTier } from "../utils/list-points";

function deepFreeze(o) {
  Object.freeze(o);
  Object.getOwnPropertyNames(o).forEach((prop) => {
    if (
      o[prop] !== null &&
      (typeof o[prop] === "object" || typeof o[prop] === "function") &&
      !Object.isFrozen(o[prop])
    ) {
      deepFreeze(o[prop]);
    }
  });
  return o;
}

// Legacy MFM versions used to embed the scrape date — "V1.0 (2026-06-17)".
// Strip that suffix so old saved lists and bookmarked share URLs still resolve
// against the new date-less dictionary keys.
function normalizeMfmVersion(v) {
  if (!v) return v;
  return v.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, "");
}

export const useMfmStore = defineStore("mfm", () => {
  const MFM = load11thMFM();
  deepFreeze(MFM);

  function isVersionKey(key) {
    return key !== "CURRENT" && key !== "PREVIOUS";
  }

  function getVersion(versionKey) {
    if (!versionKey) return null;
    const normalized = normalizeMfmVersion(versionKey);
    return (isVersionKey(normalized) && MFM[normalized]) || null;
  }

  function getPreviousMFM(currentMFM) {
    if (!currentMFM) return null;
    const versions = Object.keys(MFM).filter(isVersionKey).sort();
    const idx = versions.indexOf(currentMFM.MFM_VERSION);
    return idx > 0 ? MFM[versions[idx - 1]] : null;
  }

  function getPoints(unit, mfm, faction = null, ctx = null) {
    if (!mfm) mfm = MFM.CURRENT;
    if (!mfm || !mfm.DATA_SHEETS) return -1;

    // Wargear: the price lives on the host datasheet's wargearOptions array.
    // We look it up via `parentDataSheet` rather than walking the unit graph,
    // because `getPoints` is also called from `changes()` with no list ctx.
    if (unit.name === "Wargear") {
      if (!unit.parentDataSheet || !unit.optionName) return -1;
      let host_sheet = null;
      if (faction) {
        host_sheet = mfm.DATA_SHEETS.find(
          (d) => d.name === unit.parentDataSheet && d.faction === faction
        );
      }
      if (!host_sheet) {
        host_sheet = mfm.DATA_SHEETS.find(
          (d) => d.name === unit.parentDataSheet
        );
      }
      const opt = host_sheet?.wargearOptions?.find(
        (w) => w.name === unit.optionName
      );
      return opt ? opt.points : -1;
    }

    const isEnhancement = unit.name === "Enhancements";
    let data_sheet;

    if (isEnhancement) {
      data_sheet = mfm.DATA_SHEETS.find((d) => d.name === "Enhancements");
    } else {
      if (faction) {
        data_sheet = mfm.DATA_SHEETS.find(
          (d) => d.name === unit.name && d.faction === faction
        );
      }
      if (!data_sheet) {
        data_sheet = mfm.DATA_SHEETS.find((d) => d.name === unit.name);
      }
    }
    if (!data_sheet) return -1;

    let option;
    if (unit.optionName) {
      option = data_sheet.sizes.find((s) => s.name === unit.optionName.trim());
    } else if (unit.models) {
      option = data_sheet.sizes.find((s) => s.models === unit.models);
    }
    if (!option) return -1;

    if (!ctx) return option.basePoints ?? option.points;
    return resolveTier(option, ctx.copyIndex).points;
  }

  function getUnitPointsDifference(unit, currentMFM, previousMFM) {
    if (!currentMFM) currentMFM = MFM.CURRENT;
    if (!previousMFM) previousMFM = MFM.PREVIOUS;

    const currentUnitPoints = getPoints(unit, currentMFM);
    const previousUnitPoints = getPoints(unit, previousMFM);

    if (currentUnitPoints === -1 || previousUnitPoints === -1) return 0;
    return currentUnitPoints - previousUnitPoints;
  }

  function hasInvalidMFM(list) {
    return !list.mfm_version || !getVersion(list.mfm_version);
  }

  function autoUpgradeMFMVersion(list) {
    if (hasInvalidMFM(list)) return;
    if (!MFM.CURRENT) return;
    if (!changes(list).length) {
      list.mfm_version = MFM.CURRENT.MFM_VERSION;
    }
  }

  function changes(list) {
    if (!MFM.CURRENT) return [];
    return list.units
      .map((u) => {
        const listMFM = getVersion(list.mfm_version) || MFM.CURRENT;
        const oldPoints = getPoints(u, listMFM);
        const newPoints = getPoints(u, MFM.CURRENT);
        const pointsDiff = getUnitPointsDifference(u, MFM.CURRENT, listMFM);
        return {
          name: u.name,
          old: oldPoints,
          new: newPoints,
          difference: pointsDiff,
          models: u.models,
          optionName: u.optionName,
        };
      })
      .filter((i) => i.new !== i.old);
  }

  function isListOutdated(list) {
    return hasInvalidMFM(list) || changes(list).length > 0;
  }

  return {
    MFM,
    getVersion,
    getPreviousMFM,
    getPoints,
    getUnitPointsDifference,
    hasInvalidMFM,
    autoUpgradeMFMVersion,
    changes,
    isListOutdated,
    normalizeMfmVersion,
  };
});
