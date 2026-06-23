// Translate BSData enhancement entries (<selectionEntry type="upgrade"> under
// an Enhancement group) into our restriction schema by reading the
// modifier / condition tree.
//
// Only `scope="ancestor"` conditions encode host eligibility — they check
// the ancestor selections of the bearer (i.e. the unit the enhancement is
// attached to). Examples:
//
//   Catechism of Divine Penitence (Adepta Sororitas, line 11260):
//     <modifier type="set" field="hidden" value="true">
//       <conditionGroups><conditionGroup type="and"><conditions>
//         <condition type="notInstanceOf" scope="ancestor" childId="<Canoness id>"/>
//         <condition type="notInstanceOf" scope="ancestor" childId="<Palatine id>"/>
//         <condition type="notInstanceOf" scope="ancestor" childId="<Ministorum Priest id>"/>
//       </conditions></conditionGroup></conditionGroups>
//     </modifier>
//   → hide unless ancestor is Canoness OR Palatine OR Ministorum Priest.
//
// Other scopes are NOT host eligibility:
//   - `scope="force"` checks the force-level selections — used by BSData to
//     encode "this enhancement is only available in detachment X" or
//     "requires Adeptus Custodes ally force." That's detachment-availability
//     (which MFM tracks separately via factionJson.detachments), not host
//     attachment eligibility.
//   - `scope="roster"` / `scope="parent"` — similar.
//
// For each `scope="ancestor"` condition we resolve `childId` via the
// global ID index: a `selectionEntry type="model" | "unit"` becomes an
// `allowedHosts` entry; a `categoryEntry` becomes a `requiredKeywords`
// entry.

import { XMLParser } from "fast-xml-parser";

import { normalizeApostrophes } from "../../src/utils/apostrophe-normalization.js";

const ARRAY_NODES = new Set([
  "selectionEntry",
  "selectionEntryGroup",
  "sharedSelectionEntry",
  "sharedSelectionEntryGroup",
  "entryLink",
  "categoryLink",
  "categoryEntry",
  "cost",
  "constraint",
  "modifier",
  "modifierGroup",
  "condition",
  "conditionGroup",
  "force",
  "forceEntry",
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

// Build a global id → { kind, name, ... } index across every catalogue we
// touched. Resolving condition.childId against this index tells us whether
// the condition references a datasheet, a category keyword, a force, etc.
export function buildIdIndex(rootsByFile) {
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
      addEntry(entry, "selectionEntry", index);
      indexNode(entry, index);
    }
    for (const grp of asArray(container.selectionEntryGroup)) {
      addEntry(grp, "selectionEntryGroup", index);
      indexNode(grp, index);
    }
  }

  const cats = node.categoryEntries;
  if (cats) {
    for (const cat of asArray(cats.categoryEntry)) {
      const id = cat["@_id"];
      const name = normalizeApostrophes(cat["@_name"]);
      if (id && name) index.set(id, { kind: "category", name });
    }
  }

  const forces = node.forceEntries;
  if (forces) {
    for (const f of asArray(forces.forceEntry)) {
      const id = f["@_id"];
      const name = normalizeApostrophes(f["@_name"]);
      if (id && name) index.set(id, { kind: "force", name });
      indexNode(f, index);
    }
  }
}

function addEntry(entry, xmlKind, index) {
  const id = entry["@_id"];
  const name = normalizeApostrophes(entry["@_name"]);
  const type = entry["@_type"];
  if (!id || !name) return;
  let kind = "other";
  if (xmlKind === "selectionEntryGroup") kind = "group";
  else if (type === "model" || type === "unit") kind = "datasheet";
  else if (type === "upgrade") kind = "upgrade";
  index.set(id, { kind, name, type });
}

// Walk a catalogue tree and emit each enhancement entry — a
// `<selectionEntry type="upgrade">` whose nearest ancestor group's name
// matches /enhancement/i. (Some files keep enhancements under
// "Enhancements" directly; others under a per-detachment subgroup like
// "Army of Faith Enhancements". Both qualify.)
export function* iterEnhancements(root) {
  yield* walkForUpgrades(root, /* insideEnhancementGroup */ false);
}

function* walkForUpgrades(node, insideEnhancementGroup) {
  if (!node || typeof node !== "object") return;

  for (const key of [
    "sharedSelectionEntries",
    "sharedSelectionEntryGroups",
    "selectionEntries",
    "selectionEntryGroups",
  ]) {
    const container = node[key];
    if (!container) continue;
    for (const grp of asArray(container.selectionEntryGroup)) {
      const grpName = grp["@_name"] ?? "";
      const isEnhGroup = /enhancement/i.test(grpName);
      yield* walkForUpgrades(grp, insideEnhancementGroup || isEnhGroup);
    }
    for (const entry of asArray(container.selectionEntry)) {
      const type = entry["@_type"];
      if (type === "upgrade" && insideEnhancementGroup) {
        yield entry;
      }
      yield* walkForUpgrades(entry, insideEnhancementGroup);
    }
  }
}

// Walk every <condition> nested under this entry — directly via
// <conditions>, or under <conditionGroups>/<modifiers>/<modifierGroups> —
// and collect the childId of every condition whose `scope` is "ancestor"
// (host eligibility). Other scopes are detachment/army availability and
// not host eligibility — we ignore them.
export function collectAncestorChildIds(entry) {
  const ids = new Set();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.conditions) {
      for (const c of asArray(node.conditions.condition)) {
        const id = c["@_childId"];
        if (id && c["@_scope"] === "ancestor") ids.add(id);
      }
    }
    if (node.conditionGroups) {
      for (const cg of asArray(node.conditionGroups.conditionGroup)) visit(cg);
    }
    if (node.modifiers) {
      for (const m of asArray(node.modifiers.modifier)) visit(m);
    }
    if (node.modifierGroups) {
      for (const mg of asArray(node.modifierGroups.modifierGroup)) visit(mg);
    }
  }
  visit(entry);
  return ids;
}

// Normalize a BSData category name into our convention: drop the
// "Faction: " / "Sub-faction: " namespace prefix and uppercase.
// "Faction: Adepta Sororitas" → "ADEPTA SORORITAS"
// "Epic Hero"                 → "EPIC HERO"
// Matches normalizeKeyword in scripts/scrape-bsdata-keywords/parse-cat.mjs
// — keep the two implementations behaviorally identical.
export function normalizeCategoryName(raw) {
  let s = String(raw).trim();
  const colonIdx = s.indexOf(":");
  if (colonIdx !== -1) s = s.slice(colonIdx + 1).trim();
  return s.toUpperCase();
}

// Categories that BSData uses for catalogue plumbing but don't belong in
// a requiredKeywords list. CONFIGURATION marks "force-build options" and
// the like; UNIT / MODEL / UPGRADE are entry-type tags. The various weapon
// classes are weapon-profile flags surfacing from inline profiles. None of
// these are meaningful as eligibility constraints in the runtime.
const VOID_CATEGORIES = new Set([
  "CONFIGURATION",
  "UNIT",
  "MODEL",
  "UPGRADE",
  "WARLORD",
  "NO FORCE ORG SLOT",
  "RANGED WEAPON",
  "PISTOL WEAPON",
  "BOLT WEAPON",
  "MELEE WEAPON",
  "ATTACKS DX WEAPON",
  "DAMAGE DX WEAPON",
  "EXTRA ATTACKS WEAPON",
]);

// Translate one enhancement entry into our restriction schema.
// Returns { name, allowedHosts?, requiredKeywords? }. Does NOT extract a
// `limit` field — BSData stamps a `max 1 scope="roster"` constraint on
// nearly every enhancement (encoding muster-armies §25.04's per-army
// uniqueness rule), and emitting `limit: 1` everywhere would break the
// up-to-3 Upgrade carve-out that the runtime defers to a later change.
//
// Multi-condition translation rules:
//   * One ancestor condition resolving to a datasheet → allowedHosts: [name]
//   * One ancestor condition resolving to a category  → requiredKeywords: [kw]
//   * N>1 conditions all resolving to datasheets → allowedHosts: [...] (OR)
//   * N>1 conditions resolving to categories (or mixed) → enumerate every
//     faction datasheet whose keyword set intersects the category set, emit
//     as allowedHosts (OR). The runtime's requiredKeywords is AND-semantics,
//     which would over-restrict for the BSData OR-of-keywords pattern, so
//     we convert to datasheet enumeration instead.
//
// `keywordsByDatasheet` is the per-faction map { datasheetName: keywords[] }
// from bsdata-keywords.auto.json — required for the keyword→datasheets
// enumeration. When omitted, multi-keyword cases are dropped silently.
export function analyzeEnhancement(entry, idIndex, keywordsByDatasheet = null) {
  const result = { name: normalizeApostrophes(entry["@_name"] ?? "") };

  const datasheets = new Set();
  const keywords = new Set();
  for (const childId of collectAncestorChildIds(entry)) {
    const target = idIndex.get(childId);
    if (!target) continue;
    if (target.kind === "datasheet") {
      datasheets.add(String(target.name).toUpperCase());
    } else if (target.kind === "category") {
      const norm = normalizeCategoryName(target.name);
      if (!VOID_CATEGORIES.has(norm)) keywords.add(norm);
    }
    // force, group, upgrade, other: skip — too coarse or not eligibility.
  }

  if (keywords.size === 1 && datasheets.size === 0) {
    // Pure single-keyword case — requiredKeywords (AND of one) is correct.
    result.requiredKeywords = [...keywords];
  } else if (keywords.size > 0 && keywordsByDatasheet) {
    // Multi-keyword (OR) or mixed: enumerate datasheets in the faction whose
    // keyword set intersects any of the requested categories. Add them to
    // allowedHosts alongside any explicit datasheet conditions.
    for (const [name, kws] of Object.entries(keywordsByDatasheet)) {
      const upper = name.toUpperCase();
      if (datasheets.has(upper)) continue;
      if (kws.some((k) => keywords.has(k))) datasheets.add(upper);
    }
    if (datasheets.size) result.allowedHosts = [...datasheets].sort();
  } else if (datasheets.size) {
    // Pure datasheet condition (single or multiple) — already OR.
    result.allowedHosts = [...datasheets].sort();
  }
  // else: 0 ancestor conditions → no restriction emitted, universal defaults apply.

  return result;
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
