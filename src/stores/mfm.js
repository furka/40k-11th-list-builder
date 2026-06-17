import { defineStore } from "pinia";
import { parse } from "../utils/data-reader";
import deepFreeze from "deep-freeze";

import MFM29 from "../data/munitorum-field-manual/MFM2.9.txt?raw";
import MFM32 from "../data/munitorum-field-manual/MFM3.2.txt?raw";
import MFM33 from "../data/munitorum-field-manual/MFM3.3.txt?raw";
import MFM34 from "../data/munitorum-field-manual/MFM3.4.txt?raw";
import MFM35 from "../data/munitorum-field-manual/MFM3.5.txt?raw";
import MFM37 from "../data/munitorum-field-manual/MFM3.7.txt?raw";
import MFM38 from "../data/munitorum-field-manual/MFM3.8.txt?raw";
import MFM40 from "../data/munitorum-field-manual/MFM4.0.txt?raw";
import MFM41 from "../data/munitorum-field-manual/MFM4.1.txt?raw";
import MFM42 from "../data/munitorum-field-manual/MFM4.2.txt?raw";
import MFM43 from "../data/munitorum-field-manual/MFM4.3.txt?raw";

const EDITIONS = ["10th", "11th"];

export const useMfmStore = defineStore("mfm", () => {
  const edition10 = {};
  const edition11 = {};

  const imports = [MFM29, MFM32, MFM33, MFM34, MFM35, MFM37, MFM38, MFM40, MFM41, MFM42, MFM43];

  imports.forEach((mod) => {
    const { FACTIONS, DATA_SHEETS, MFM_VERSION } = parse(mod);
    edition10[MFM_VERSION] = {
      FACTIONS,
      DATA_SHEETS,
      MFM_VERSION,
      EDITION: "10th",
    };

    if (!edition10.CURRENT) {
      edition10.CURRENT = edition10[MFM_VERSION];
    } else if (MFM_VERSION > edition10.CURRENT.MFM_VERSION) {
      edition10.CURRENT = edition10[MFM_VERSION];
    }

    if (!edition10.PREVIOUS) {
      edition10.PREVIOUS = edition10[MFM_VERSION];
    } else if (
      MFM_VERSION > edition10.PREVIOUS.MFM_VERSION &&
      MFM_VERSION < edition10.CURRENT.MFM_VERSION
    ) {
      edition10.PREVIOUS = edition10[MFM_VERSION];
    }
  });

  // 11th edition placeholder; populated in Phase B.
  edition11.CURRENT = null;
  edition11.PREVIOUS = null;

  const CURRENT_EDITION = "10th";

  const MFM = {
    "10th": edition10,
    "11th": edition11,
    CURRENT_EDITION,
  };

  // Legacy aliases — resolve to the current edition's bucket. Untouched
  // consumers see the same MFM.CURRENT / MFM.PREVIOUS they did before.
  Object.defineProperty(MFM, "CURRENT", {
    get() {
      return MFM[MFM.CURRENT_EDITION]?.CURRENT ?? null;
    },
    enumerable: true,
  });
  Object.defineProperty(MFM, "PREVIOUS", {
    get() {
      return MFM[MFM.CURRENT_EDITION]?.PREVIOUS ?? null;
    },
    enumerable: true,
  });

  deepFreeze(MFM);

  function isVersionKey(key) {
    return key !== "CURRENT" && key !== "PREVIOUS";
  }

  function getVersion(versionKey, edition) {
    if (!versionKey) return null;
    if (edition) {
      const bucket = MFM[edition];
      return (bucket && isVersionKey(versionKey) && bucket[versionKey]) || null;
    }
    for (const ed of EDITIONS) {
      const bucket = MFM[ed];
      if (bucket && isVersionKey(versionKey) && bucket[versionKey]) {
        return bucket[versionKey];
      }
    }
    return null;
  }

  function getPreviousMFM(currentMFM) {
    if (!currentMFM) {
      return null;
    }

    const edition = currentMFM.EDITION || "10th";
    const bucket = MFM[edition];
    if (!bucket) return null;

    const versions = Object.keys(bucket)
      .filter(isVersionKey)
      .sort();

    const currentVersionKey = currentMFM.MFM_VERSION;
    const currentIndex = versions.indexOf(currentVersionKey);

    return currentIndex > 0 ? bucket[versions[currentIndex - 1]] : null;
  }

  function getPoints(unit, mfm, faction = null) {
    if (!mfm) {
      mfm = MFM.CURRENT;
    }
    if (!mfm || !mfm.DATA_SHEETS) {
      return -1;
    }

    let data_sheet;

    // Check if this is an enhancement (has no models field and has optionName)
    const isEnhancement = !unit.models && unit.optionName;

    if (isEnhancement) {
      // For enhancements, look for the "Enhancements" datasheet
      data_sheet = mfm.DATA_SHEETS.find((d) => d.name === "Enhancements");
    } else {
      // If faction provided, prioritize units from that faction
      if (faction) {
        data_sheet = mfm.DATA_SHEETS.find(
          (d) => d.name === unit.name && d.faction === faction
        );
      }

      // Fallback to any unit with matching name
      if (!data_sheet) {
        data_sheet = mfm.DATA_SHEETS.find((d) => d.name === unit.name);
      }
    }

    let option;

    if (!data_sheet) {
      return -1;
    }

    if (unit.optionName) {
      option = data_sheet.sizes.find((s) => s.name === unit.optionName.trim());
    } else if (unit.models) {
      option = data_sheet.sizes.find((s) => s.models === unit.models);
    }

    if (option) {
      return option.points;
    }

    return -1;
  }

  function getUnitPointsDifference(unit, currentMFM, previousMFM) {
    if (!currentMFM) {
      currentMFM = MFM.CURRENT;
    }
    if (!previousMFM) {
      previousMFM = MFM.PREVIOUS;
    }

    const currentUnitPoints = getPoints(unit, currentMFM);
    const previousUnitPoints = getPoints(unit, previousMFM);

    if (currentUnitPoints === -1 || previousUnitPoints === -1) {
      return 0;
    }

    return currentUnitPoints - previousUnitPoints;
  }

  function hasInvalidMFM(list) {
    const version = list.mfm_version;
    if (!version) return true;
    const edition = list.edition || "10th";
    return !getVersion(version, edition);
  }

  function autoUpgradeMFMVersion(list) {
    if (hasInvalidMFM(list)) {
      return;
    }

    const edition = list.edition || "10th";
    const editionCurrent = MFM[edition]?.CURRENT;
    if (!editionCurrent) return;

    if (!changes(list).length) {
      list.mfm_version = editionCurrent.MFM_VERSION;
    }
  }

  function changes(list) {
    const edition = list.edition || "10th";
    const editionCurrent = MFM[edition]?.CURRENT;
    if (!editionCurrent) return [];

    return list.units
      .map((u) => {
        const listMFM = getVersion(list.mfm_version, edition) || editionCurrent;
        const oldPoints = getPoints(u, listMFM);
        const newPoints = getPoints(u, editionCurrent);
        const pointsDiff = getUnitPointsDifference(u, editionCurrent, listMFM);

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
  };
});
