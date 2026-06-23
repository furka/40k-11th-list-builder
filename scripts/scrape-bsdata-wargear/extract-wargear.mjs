// Translate BSData wargear entries on a datasheet's subtree into a flat
// `maxPerUnit` cap for each MFM-paid wargear option.
//
// The MFM JSON lists paid wargear as a flat per-datasheet array:
//   wargearOptions: [{ name: "Macro plasma incinerator", points: 10 }, ...]
//
// BSData carries those same options nested deep inside the unit's
// <selectionEntries>/<selectionEntryGroups> tree, often as <entryLink>s
// inside a selectionEntryGroup that enforces a max-1-selection rule:
//
//   <selectionEntry type="unit" name="REDEMPTOR DREADNOUGHT">
//     <selectionEntryGroups>
//       <selectionEntryGroup name="Wargear">
//         <selectionEntryGroups>
//           <selectionEntryGroup name="Weapon Option 1">
//             <constraints>
//               <constraint type="max" value="1" scope="parent"/>
//             </constraints>
//             <entryLinks>
//               <entryLink name="Macro Plasma Incinerator" .../>
//               <entryLink name="Heavy Onslaught Gatling Cannon" .../>
//             </entryLinks>
//           </selectionEntryGroup>
//   ...
//
// For each MFM wargear name (case-insensitive match), we walk every leaf
// occurrence in the unit subtree, collect all `<constraint type="max">`
// values on the leaf and on every ancestor up to the unit, and emit the
// MIN as `maxPerUnit`. A `scope="unit"` constraint on the leaf overrides
// (taken directly, not min'd with chain constraints) — it's the explicit
// per-unit cap BattleScribe uses for wargear like a Devastator's grav-gun.
//
// When no constraint is found anywhere on the chain we emit nothing, and
// the runtime falls back to the existing 20-per-host placeholder. That
// keeps unrecognized wargear behaviorally unchanged.

import { XMLParser } from "fast-xml-parser";

import { normalizeApostrophes } from "../../src/utils/apostrophe-normalization.js";

const ARRAY_NODES = new Set([
  "selectionEntry",
  "selectionEntryGroup",
  "sharedSelectionEntry",
  "sharedSelectionEntryGroup",
  "entryLink",
  "categoryLink",
  "constraint",
  "modifier",
  "modifierGroup",
  "condition",
  "conditionGroup",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  allowBooleanAttributes: true,
  isArray: (name) => ARRAY_NODES.has(name),
});

export function parseCatRaw(xml) {
  const tree = parser.parse(xml);
  return tree.catalogue ?? tree.gameSystem ?? null;
}

// Index every selectionEntry/entryLink-target across all loaded .cat files
// by `id`. Lets us resolve an entryLink's `targetId` to the shared entry it
// references — a paid wargear like "Macro Plasma Incinerator" lives in
// the catalogue as one shared selectionEntry that gets linked from inside
// the Redemptor Dreadnought's weapon group.
export function buildTargetIndex(rootsByFile) {
  const index = new Map();
  for (const root of Object.values(rootsByFile)) {
    if (root) indexNode(root, index);
  }
  return index;
}

function indexNode(node, index) {
  if (!node || typeof node !== "object") return;
  for (const key of [
    "sharedSelectionEntries",
    "sharedSelectionEntryGroups",
    "selectionEntries",
    "selectionEntryGroups",
  ]) {
    const container = node[key];
    if (!container) continue;
    for (const entry of asArray(container.selectionEntry)) {
      const id = entry["@_id"];
      if (id) index.set(id, entry);
      indexNode(entry, index);
    }
    for (const grp of asArray(container.selectionEntryGroup)) {
      const id = grp["@_id"];
      if (id) index.set(id, grp);
      indexNode(grp, index);
    }
  }
}

// Walk every top-level datasheet `<selectionEntry>` in a catalogue.
// Multi-model squads are encoded as `type="unit"` (e.g. Intercessor Squad);
// single-model datasheets — dreadnoughts, vehicles, character HQs — are
// encoded as a top-level `type="model"` entry (e.g. Redemptor Dreadnought).
// Both forms need scanning. We don't recurse into nested entries — sub-
// model entries like "Intercessor Sergeant" are not standalone datasheets.
export function* iterUnits(root) {
  if (!root || typeof root !== "object") return;
  for (const key of [
    "sharedSelectionEntries",
    "selectionEntries",
  ]) {
    const container = root[key];
    if (!container) continue;
    for (const entry of asArray(container.selectionEntry)) {
      const t = entry["@_type"];
      if (t === "unit" || t === "model") yield entry;
    }
  }
}

// Compute `maxPerUnit` for every MFM wargear option found on this unit's
// subtree. Returns a `{ optionName: maxPerUnit }` map keyed by the MFM
// spelling.
//
// `wargearNames` is a Set of normalized MFM names (lowercased + apostrophe
// normalized). `wargearOriginal` maps each normalized form back to the
// MFM spelling that should appear in the output JSON.
//
// Algorithm: walk the subtree top-down, carrying a running "instances per
// unit" product. At each step:
//
//   - A `<selectionEntryGroup>` is a slot, not a repeatable thing — it
//     contributes ×1 instance. The group's `max scope="parent"` is a cap
//     on TOTAL selections from within the group (a "pick one of these"
//     constraint that bounds whichever option the user picks), so it's
//     passed down as a per-child upper bound rather than a multiplier.
//   - A `<selectionEntry>` (a model or upgrade) IS instantiable — its
//     `max scope="parent"` is its per-parent headcount. We multiply by
//     min(its own max, parent group's selection cap if any).
//
// When we land on a wargear name match, the running product is the
// maxPerUnit estimate. A `scope="unit"` max constraint on the wargear
// short-circuits — it's an explicit flat cap.
//
// Multiple paths to the same option (wargear shared across sergeant and
// grunt model slots, or BSData carrying duplicate entryLinks) are
// aggregated with MAX. SUM would double-count; MIN over-restricts.
export function extractWargearCaps(unitEntry, {
  wargearNames,
  wargearOriginal,
  targetIndex,
}) {
  const found = {};
  walk(unitEntry, /* runningTotal */ 1, /* parentGroupCap */ null);
  return found;

  function walk(node, runningTotal, parentGroupCap) {
    if (!node || typeof node !== "object") return;

    for (const containerKey of [
      "sharedSelectionEntries",
      "sharedSelectionEntryGroups",
      "selectionEntries",
      "selectionEntryGroups",
    ]) {
      const container = node[containerKey];
      if (!container) continue;
      for (const child of asArray(container.selectionEntry)) {
        visitEntry(child, /* linkTarget */ null, runningTotal, parentGroupCap);
      }
      for (const child of asArray(container.selectionEntryGroup)) {
        visitGroup(child, runningTotal);
      }
    }
    if (node.entryLinks) {
      for (const link of asArray(node.entryLinks.entryLink)) {
        const targetId = link["@_targetId"];
        const target = targetId ? targetIndex.get(targetId) : null;
        const targetType = target?.["@_type"];
        if (targetType === "selectionEntryGroup") {
          // Rare but legal: entryLink pointing to a shared group. Same
          // semantics as an inline group — contributes ×1 instance.
          visitGroup(target, runningTotal, link);
        } else {
          visitEntry(link, target, runningTotal, parentGroupCap);
        }
      }
    }
  }

  function visitEntry(entry, linkTarget, runningTotal, parentGroupCap) {
    const ownMax = combinedParentMax(entry, linkTarget);
    const effectiveOwn = applyGroupCap(ownMax, parentGroupCap);
    // `effectiveOwn` = max copies of this entry in its immediate parent.
    // When neither the entry nor the parent group has a constraint we
    // treat the contribution as null (unbounded) — caller skips emission.
    const childTotal = multiplyMaybe(runningTotal, effectiveOwn);

    const rawName = entry["@_name"] ?? linkTarget?.["@_name"] ?? null;
    const norm = normalizeName(rawName);
    if (norm && wargearNames.has(norm)) {
      const unitMax = unitMaxConstraint(entry) ??
        (linkTarget ? unitMaxConstraint(linkTarget) : null);
      let cap;
      if (unitMax !== null) {
        cap = unitMax;
      } else if (childTotal !== null && Number.isFinite(childTotal)) {
        cap = childTotal;
      } else {
        cap = null;
      }
      if (cap !== null && Number.isFinite(cap) && cap >= 1) {
        const outName = wargearOriginal.get(norm) ?? rawName;
        const prev = found[outName];
        if (prev === undefined || cap > prev) found[outName] = cap;
      }
    }

    // Children of this entry have a non-group parent — clear the cap.
    walk(entry, childTotal ?? runningTotal, /* parentGroupCap */ null);
    if (linkTarget) {
      walk(linkTarget, childTotal ?? runningTotal, null);
    }
  }

  function visitGroup(group, runningTotal, viaLink = null) {
    // A group is a slot — ×1 instance per parent. The running total is
    // unchanged. The group's `max scope="parent"` is a per-child upper
    // bound (total selections from this group can't exceed it), passed
    // down to direct children.
    const groupOwn = parentMaxConstraint(group);
    const linkOwn = viaLink ? parentMaxConstraint(viaLink) : null;
    const groupCap = combinedMin(groupOwn, linkOwn);
    walk(group, runningTotal, groupCap);
  }
}

function combinedParentMax(child, linkTarget) {
  const a = parentMaxConstraint(child);
  const b = linkTarget ? parentMaxConstraint(linkTarget) : null;
  return combinedMin(a, b);
}

function combinedMin(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

// Combine an entry's own max-per-parent with the parent group's
// total-selections cap (when the parent IS a group). The effective max
// is the smaller; if neither is set we return null = unbounded.
function applyGroupCap(ownMax, parentGroupCap) {
  return combinedMin(ownMax, parentGroupCap);
}

function multiplyMaybe(running, factor) {
  if (factor === null) return null;
  return running * factor;
}

function parentMaxConstraint(node) {
  if (!node || !node.constraints) return null;
  let min = null;
  for (const c of asArray(node.constraints.constraint)) {
    if (c["@_type"] !== "max") continue;
    if (c["@_field"] !== "selections") continue;
    const scope = c["@_scope"];
    if (scope !== "parent") continue;
    const v = Number(c["@_value"]);
    if (!Number.isFinite(v)) continue;
    if (min === null || v < min) min = v;
  }
  return min;
}

function unitMaxConstraint(node) {
  if (!node || !node.constraints) return null;
  let min = null;
  for (const c of asArray(node.constraints.constraint)) {
    if (c["@_type"] !== "max") continue;
    if (c["@_field"] !== "selections") continue;
    if (c["@_scope"] !== "unit") continue;
    const v = Number(c["@_value"]);
    if (!Number.isFinite(v)) continue;
    if (min === null || v < min) min = v;
  }
  return min;
}

export function normalizeName(raw) {
  if (raw == null) return null;
  return normalizeApostrophes(String(raw).trim().toLowerCase());
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
