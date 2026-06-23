import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { restore, debouncedSave } from "../utils/localStorage";
import { useMfmStore } from "./mfm";
import { useCodexStore } from "./codex";
import { unitMax } from "../utils/unit-max";
import { computeListPoints } from "../utils/list-points";
import { battleSizeRules } from "../utils/battle-size";
import {
  attachedToError,
  isWargearUnit,
  isEnhancementUnit,
} from "../utils/attachment-rules";
import { wargearMaxPerUnit } from "../utils/wargear-limits";
import { legalDropSlots } from "../utils/legal-drop-slots";
import { hasKeyword, getKeywords } from "../utils/keywords";

function uniqueTagsOf(meta) {
  return meta?.tags?.filter((t) => typeof t === "string" && t.startsWith("UNIQUE:")) ?? [];
}

export const useArmyListStore = defineStore("armyList", () => {
  const mfmStore = useMfmStore();
  const codexStore = useCodexStore();
  const name = ref("");
  const faction = ref("");
  const maxPoints = ref(2000);
  const mfm_version = ref(mfmStore.MFM.CURRENT?.MFM_VERSION || "");
  const version = ref("");
  const modifiedDate = ref(Date.now());
  const sortOrder = ref("");
  const units = ref([]);
  const detachments = ref([]);
  const allies = ref([]);
  const bonusBattleline = ref([]);

  const effectiveMaxPoints = computed(() => maxPoints.value);

  const currentMFM = computed(() => mfmStore.getVersion(mfm_version.value));

  const pointsBreakdown = computed(() => {
    return computeListPoints(toObject(), currentMFM.value, faction.value);
  });

  const unitCounts = computed(() => {
    const counts = {};
    units.value.forEach((unit) => {
      // Wargear is a per-host sub-option, not a datasheet "copy" — counting it
      // here would falsely tick the unit-cap meter on a fictitious "Wargear"
      // datasheet and (worse) bleed into the "X/Y available" display.
      if (isWargearUnit(unit)) return;
      counts[unit.name] = (counts[unit.name] || 0) + 1;
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
      // Only real Enhancement sentinels go into the uniqueness set. The old
      // "any optionName" predicate would silently absorb wargear option names
      // ("per Bombast field gun"), poisoning enhancement uniqueness checks.
      if (unit.name === "Enhancements" && unit.optionName) {
        taken.add(unit.optionName);
      }
    });
    return taken;
  });

  const totalEnhancementsCount = computed(() => {
    let count = 0;
    units.value.forEach((unit) => {
      if (unit.name === "Enhancements") count++;
    });
    return count;
  });

  // Single O(n) parent→children index so ArmyListUnitNode doesn't run an
  // O(n) filter per node per mutation. Read via `unitsByParent.get(parentId)`
  // — root units share the `null` bucket.
  const unitsByParent = computed(() => {
    const map = new Map();
    for (const u of units.value) {
      const p = u.attachedTo ?? null;
      if (!map.has(p)) map.set(p, []);
      map.get(p).push(u);
    }
    return map;
  });

  /**
   * Resolve an Enhancement unit to the canonical metadata stored on its
   * detachment — `{ name, points, ...restrictionFields }` where the optional
   * restriction subset is the schema documented in
   * `src/data/configs/enhancement-restrictions.auto.json`.
   * Prefer the unit's own `detachment` tag (set at add time); fall back to
   * scanning all of the faction's detachments so shared lists missing that
   * tag still resolve.
   */
  function getEnhancementMeta(unit) {
    if (!unit?.optionName) return null;
    const factionEntry = currentMFM.value?.FACTIONS?.find(
      (f) => f.name === faction.value
    );
    if (!factionEntry) return null;
    const detNames = unit.detachment
      ? [unit.detachment]
      : (factionEntry.detachments ?? []).map((d) => d.name);
    for (const dName of detNames) {
      const det = factionEntry.detachments.find((d) => d.name === dName);
      const enh = det?.enhancements?.find((e) => e.name === unit.optionName);
      if (enh) return enh;
    }
    return null;
  }

  // Single-pass per-unit validation. Each component reads via
  // `validationErrors.value.get(unit.id)` instead of running an O(n) check
  // per row — collapses the previous N×O(n) cascade into one O(n) pass.
  const validationErrors = computed(() => {
    const errors = new Map();
    const all = units.value;

    const byId = new Map(all.map((u) => [u.id, u]));
    const byParent = new Map();
    for (const u of all) {
      const p = u.attachedTo ?? null;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(u);
    }

    const wargearGroups = new Map();
    const enhByOption = new Map();
    const allEnhancements = [];
    for (const u of all) {
      if (isWargearUnit(u)) {
        const k = `${u.attachedTo}::${u.optionName}`;
        if (!wargearGroups.has(k)) wargearGroups.set(k, []);
        wargearGroups.get(k).push(u);
      } else if (u.name === "Enhancements") {
        if (!enhByOption.has(u.optionName)) enhByOption.set(u.optionName, []);
        enhByOption.get(u.optionName).push(u);
        allEnhancements.push(u);
      }
    }

    const rootIdMemo = new Map();
    function rootIdOf(u) {
      if (!u) return null;
      if (rootIdMemo.has(u.id)) return rootIdMemo.get(u.id);
      let cursor = u;
      const seen = new Set();
      while (cursor?.attachedTo && byId.has(cursor.attachedTo)) {
        if (seen.has(cursor.id)) break;
        seen.add(cursor.id);
        cursor = byId.get(cursor.attachedTo);
      }
      const id = cursor?.id ?? null;
      rootIdMemo.set(u.id, id);
      return id;
    }

    const enhInTreeMemo = new Map();
    function enhancementsInTree(rootId) {
      if (!rootId) return [];
      if (enhInTreeMemo.has(rootId)) return enhInTreeMemo.get(rootId);
      const out = [];
      const stack = [rootId];
      const seen = new Set();
      while (stack.length) {
        const id = stack.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        for (const child of byParent.get(id) ?? []) {
          if (isEnhancementUnit(child)) out.push(child);
          stack.push(child.id);
        }
      }
      enhInTreeMemo.set(rootId, out);
      return out;
    }

    const factionEntry = currentMFM.value?.FACTIONS?.find(
      (f) => f.name === faction.value
    );
    const factionDetachmentsByName = new Map();
    for (const d of factionEntry?.detachments ?? []) {
      factionDetachmentsByName.set(d.name, d);
    }
    const availableEnhSet = new Set();
    for (const dName of detachments.value ?? []) {
      const meta = factionDetachmentsByName.get(dName);
      for (const e of meta?.enhancements ?? []) availableEnhSet.add(e.name);
    }

    const rules = battleSizeRules(toObject());
    const mfmVersionLabel = currentMFM.value?.MFM_VERSION || "unknown";
    const list = toObject();

    const alliesSet = new Set(allies.value ?? []);

    function computeErrorFor(unit) {
      if (unit.error) return "Invalid Unit";

      if (unit.allied) {
        // The unit's source faction is pinned at add time on
        // `unit.alliedFaction`. Same-named datasheets in different codexes
        // can have different points costs, so the validity check is tied
        // to that specific faction, not "any codex that happens to have a
        // datasheet with this name". Legacy lists without the field fall
        // back to a name-scan so we don't break existing saved armies.
        const sourceFaction =
          unit.alliedFaction ||
          (() => {
            for (const sheet of codexStore.compendium) {
              if (sheet.name === unit.name && sheet.faction !== faction.value) {
                return sheet.faction;
              }
            }
            return null;
          })();
        if (
          sourceFaction &&
          sourceFaction !== faction.value &&
          !alliesSet.has(sourceFaction)
        ) {
          return `Must ally ${sourceFaction}`;
        }
      }

      if (isWargearUnit(unit)) {
        if (!unit.attachedTo) return "Wargear must be attached to a unit";
        const host = byId.get(unit.attachedTo);
        if (!host) return "Wargear's unit is missing";
        if (host.name !== unit.parentDataSheet) {
          return `Wargear belongs to ${unit.parentDataSheet}`;
        }
        const hostDs = codexStore.getDataSheet(host.name);
        const option = hostDs?.wargearOptions?.find(
          (w) => w.name === unit.optionName
        );
        if (!option) {
          return `Wargear option not available in MFM ${mfmVersionLabel}`;
        }

        const max = wargearMaxPerUnit(option);
        const sameOption =
          wargearGroups.get(`${unit.attachedTo}::${unit.optionName}`) ?? [];
        if (sameOption.length > max) {
          const indexOfThis = sameOption.findIndex((u) => u.id === unit.id);
          if (indexOfThis >= max) return `Only ${max} per unit`;
        }
        return false;
      }

      const datasheet = codexStore.getDataSheet(unit.name);

      if (datasheet?.enhancements || unit.name === "Enhancements") {
        if (!availableEnhSet.has(unit.optionName)) {
          return "Enhancement not available in this detachment";
        }

        const meta = getEnhancementMeta(unit);

        if (typeof meta?.limit === "number") {
          const sameOption = enhByOption.get(unit.optionName) ?? [];
          const indexOfThis = sameOption.findIndex((u) => u.id === unit.id);
          if (indexOfThis >= meta.limit) {
            return `Only ${meta.limit} of this enhancement allowed`;
          }
        }

        if (rules) {
          const indexOfThis = allEnhancements.findIndex(
            (u) => u.id === unit.id
          );
          if (indexOfThis >= rules.maxEnhancements) {
            return `Only ${rules.maxEnhancements} enhancements allowed in ${rules.label}`;
          }
        }

        if (!unit.attachedTo) return "Enhancement must be attached to a unit";
        const host = byId.get(unit.attachedTo);
        if (!host) return "Attached to a missing unit";
        if (host.name === "Enhancements") {
          return "Enhancement can't be attached to another enhancement";
        }

        const rootId = rootIdOf(host);
        if (rootId) {
          const inTree = enhancementsInTree(rootId);
          const indexOfThis = inTree.findIndex((u) => u.id === unit.id);
          if (indexOfThis >= 1) {
            return "Only one enhancement per attached unit";
          }
        }

        const hostDs = codexStore.getDataSheet(host.name);
        if (meta?.characterOnly && !hasKeyword(hostDs, "CHARACTER")) {
          return "Enhancement can only attach to a character";
        }
        if (meta?.nonCharacterOnly && hasKeyword(hostDs, "CHARACTER")) {
          return "Unit upgrades can't attach to characters";
        }
        if (meta?.notOnEpicHeroes && hasKeyword(hostDs, "EPIC HERO")) {
          return "Enhancement can't be given to Epic Heroes";
        }
        // `allowedHosts` and `requiredKeywords` form a disjunction: the host
        // is legal if either its datasheet name is on the allowlist OR every
        // required keyword is present on its keyword set. See
        // legal-drop-slots.js for the matching enforcement at drop time.
        if (meta?.allowedHosts?.length || meta?.requiredKeywords?.length) {
          const nameMatch = meta.allowedHosts?.includes(host.name);
          const hostKeywords = getKeywords(hostDs);
          const keywordMatch =
            meta.requiredKeywords?.length > 0 &&
            meta.requiredKeywords.every((k) => hostKeywords.has(k));
          if (!nameMatch && !keywordMatch) {
            const parts = [];
            if (meta.allowedHosts?.length) parts.push(meta.allowedHosts.join(", "));
            if (meta.requiredKeywords?.length) {
              parts.push(`unit with ${meta.requiredKeywords.join(" + ")}`);
            }
            return `Enhancement can only attach to: ${parts.join(" or ")}`;
          }
        }

        return false;
      }

      const count = unitCounts.value[unit.name] || 0;

      if (!datasheet) {
        return `Unit not available in MFM ${mfmVersionLabel}`;
      }

      const points = mfmStore.getPoints(unit, currentMFM.value, faction.value);
      if (points === -1) {
        return `Unit not found in MFM ${mfmVersionLabel}`;
      }

      const max = unitMax(datasheet, list);
      if (count > max) return `Only ${max} of this unit allowed`;

      if (datasheet.support && !unit.attachedTo) {
        return "Support character must attach to a unit";
      }

      if (unit.attachedTo) {
        const host = byId.get(unit.attachedTo);
        const error = attachedToError(unit, host, (name) =>
          codexStore.getDataSheet(name)
        );
        if (error) return error;
      }

      return false;
    }

    for (const unit of all) errors.set(unit.id, computeErrorFor(unit));
    return errors;
  });

  function getUnitValidationError(unit) {
    if (!unit) return false;
    const cached = validationErrors.value.get(unit.id);
    return cached === undefined ? false : cached;
  }

  function addUnit(unit) {
    units.value = [unit, ...units.value];
    modifiedDate.value = Date.now();
  }

  /**
   * Add an enhancement to the list and, if a valid host already exists, attach
   * it to the first such host (in flat-array order, which is also the visual
   * row order). Falls through to "live at root, flagged with a red error" when
   * no legal host exists — same as drag-and-drop.
   *
   * Legality is delegated to legalDropSlots so the per-enhancement metadata
   * (allowedHosts, characterOnly, requiredKeywords suppression, etc.) is
   * respected identically to a drag.
   */
  function addEnhancement({ optionName, detachment }) {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `enh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const unit = { id, name: "Enhancements", optionName, detachment };
    addUnit(unit);

    const meta = getEnhancementMeta(unit);
    const slots = legalDropSlots(units.value, id, codexStore.getDataSheet, meta);
    const attachHostIds = new Set(
      slots.filter((s) => s.type === "attach").map((s) => s.hostId)
    );
    if (attachHostIds.size === 0) return; // no legal host — leave at root.

    const firstHost = units.value.find((u) => attachHostIds.has(u.id));
    if (firstHost) moveUnit(id, firstHost.id, 0);
  }

  function removeUnit(id) {
    // Orphan any units that were attached to the one being removed — they
    // float back to the root list so the user can re-attach to a different
    // host instead of losing them.
    units.value = units.value
      .filter((u) => u.id !== id)
      .map((u) => (u.attachedTo === id ? { ...u, attachedTo: undefined } : u));
    modifiedDate.value = Date.now();
  }

  /**
   * Remove a unit AND every unit attached to it (recursively). Used when the
   * user drags a host to the bin — orphaning the attached children would
   * leave them stranded at root, while dragging-to-trash intuitively means
   * "delete the whole thing." `removeUnit` keeps the orphan behavior for
   * call sites where the children should survive.
   */
  function removeUnitSubtree(id) {
    const doomed = new Set([id]);
    const stack = [id];
    while (stack.length) {
      const parentId = stack.pop();
      for (const u of units.value) {
        if (u.attachedTo === parentId && !doomed.has(u.id)) {
          doomed.add(u.id);
          stack.push(u.id);
        }
      }
    }
    units.value = units.value.filter((u) => !doomed.has(u.id));
    modifiedDate.value = Date.now();
  }

  function setUnits(newUnits) {
    units.value = newUnits;
  }

  /**
   * Re-parent and/or reposition a unit within its sibling group.
   *
   * Driven by the unit drag store: every committed drop maps to a single call
   * here. The unit is removed from its current spot in the flat array, its `attachedTo`
   * is set to `parentId` (or cleared when parentId is null), and it's
   * re-inserted so it sits at position `sibIdx` among siblings sharing the
   * same `attachedTo`.
   *
   * Flat-array order matters because the tier engine walks units in order
   * and decides which copy is the 1st / 2nd / 3rd of its datasheet. Keeping
   * sibling order on-screen aligned with flat-array order avoids a confusing
   * gap between the visible row position and the price tier.
   */
  function moveUnit(id, parentId, sibIdx) {
    const idx = units.value.findIndex((u) => u.id === id);
    if (idx === -1) return;
    const next = { ...units.value[idx] };
    if (parentId) next.attachedTo = parentId;
    else delete next.attachedTo;

    const arr = [...units.value];
    arr.splice(idx, 1);

    const targetParent = parentId ?? null;
    const siblingFlatIndices = [];
    arr.forEach((u, i) => {
      const p = u.attachedTo ?? null;
      if (p === targetParent) siblingFlatIndices.push(i);
    });
    const insertAt =
      typeof sibIdx === "number" && sibIdx < siblingFlatIndices.length
        ? siblingFlatIndices[sibIdx]
        : arr.length;
    arr.splice(insertAt, 0, next);

    units.value = arr;
    modifiedDate.value = Date.now();
  }

  function addDetachment(name) {
    if (!whyCantAddDetachment(name)) {
      detachments.value = [...detachments.value, name];
      modifiedDate.value = Date.now();
      return true;
    }
    return false;
  }

  // Single-pass per-detachment validation. Each CodexDetachmentCard reads via
  // `detachmentErrors.value.get(name)` instead of running the full
  // `whyCantAddDetachment` check per card. "Already added" is intentionally
  // excluded — the wrapper below handles that branch.
  const detachmentErrors = computed(() => {
    const errors = new Map();
    const factionEntry = currentMFM.value?.FACTIONS?.find(
      (f) => f.name === faction.value
    );
    const allDetachments = factionEntry?.detachments ?? [];
    const allByName = new Map(allDetachments.map((d) => [d.name, d]));
    const selected = detachments.value ?? [];

    const rules = battleSizeRules(toObject());
    const breakdown = pointsBreakdown.value?.dp;

    const existingUniqueTags = new Set();
    let existingThreeDp = null;
    for (const dName of selected) {
      const meta = allByName.get(dName);
      if (!meta) continue;
      for (const t of uniqueTagsOf(meta)) existingUniqueTags.add(t);
      if ((meta.dp ?? 0) >= 3 && !existingThreeDp) existingThreeDp = meta;
    }

    function reasonFor(meta) {
      const cost = meta.dp ?? 0;

      if (cost >= 3 && rules && !rules.allow3DpDetachment) {
        return `3-DP detachments require at least 2,000 points`;
      }
      if (cost >= 3 && selected.length > 0) {
        return "3-DP detachments can't be combined with other detachments";
      }
      if (existingThreeDp) {
        return `Cannot add alongside a 3-DP detachment (${existingThreeDp.name})`;
      }

      const candidateTags = uniqueTagsOf(meta);
      for (const t of candidateTags) {
        if (existingUniqueTags.has(t)) return `Cannot share ${t} keyword`;
      }

      if (breakdown && breakdown.used + cost > breakdown.max) {
        return "Not enough DP";
      }
      return null;
    }

    for (const meta of allDetachments) {
      errors.set(meta.name, reasonFor(meta));
    }
    return errors;
  });

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
    const cached = detachmentErrors.value.get(name);
    return cached === undefined ? null : cached;
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

  /**
   * Replace the allied-factions list. Units from a now-un-allied faction
   * stay in the army but their per-unit validation flags them — the user
   * can re-check the ally to restore them, or delete them by hand. See the
   * `unit.allied && faction not in allies` branch in `computeErrorFor`.
   */
  function setAllies(arr) {
    allies.value = Array.isArray(arr) ? arr.filter((n) => n !== faction.value) : [];
    modifiedDate.value = Date.now();
  }

  function toggleBonusBattleline(name) {
    if (!name) return;
    const current = bonusBattleline.value;
    bonusBattleline.value = current.includes(name)
      ? current.filter((n) => n !== name)
      : [...current, name];
    modifiedDate.value = Date.now();
  }

  function setList(list) {
    name.value = list.name || "";
    faction.value = list.faction || "";
    maxPoints.value = list.maxPoints || 2000;
    mfm_version.value = mfmStore.normalizeMfmVersion(list.mfm_version || "");
    version.value = list.version || "";
    modifiedDate.value = list.modifiedDate || Date.now();
    sortOrder.value = list.sortOrder || "";
    units.value = list.units || [];
    detachments.value = Array.isArray(list.detachments) ? list.detachments : [];
    allies.value = Array.isArray(list.allies) ? list.allies : [];
    bonusBattleline.value = Array.isArray(list.bonusBattleline)
      ? list.bonusBattleline
      : [];
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
      allies: allies.value,
      bonusBattleline: bonusBattleline.value,
    };
  }

  function loadFromStorage(defaultList = null) {
    const savedList = restore("currentList");
    if (savedList) setList(savedList);
    else if (defaultList) setList(defaultList);
  }

  // Shallow watcher: Vue tracks the .value reads inside toObject(), and every
  // mutation path in this store reassigns refs (units.value = newArr) rather
  // than editing in place — so a shallow watcher fires correctly without
  // paying the cost of traversing every unit's every field per mutation.
  watch(
    () => toObject(),
    (currentList) => debouncedSave("currentList", currentList),
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
    allies,
    bonusBattleline,
    unitCounts,
    modelsTaken,
    enhancementsTaken,
    totalEnhancementsCount,
    unitsByParent,
    effectiveMaxPoints,
    currentMFM,
    pointsBreakdown,
    validationErrors,
    detachmentErrors,
    getUnitValidationError,
    getEnhancementMeta,
    addUnit,
    addEnhancement,
    removeUnit,
    removeUnitSubtree,
    setUnits,
    moveUnit,
    addDetachment,
    removeDetachment,
    setDetachments,
    canAddDetachment,
    whyCantAddDetachment,
    setAllies,
    toggleBonusBattleline,
    setList,
    toObject,
    loadFromStorage,
  };
});
