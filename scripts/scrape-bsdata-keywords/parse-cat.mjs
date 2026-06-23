import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  allowBooleanAttributes: true,
  isArray: (name) => ARRAY_NODES.has(name),
});

// Force these BattleScribe nodes to always be arrays even when there's a
// single child — otherwise fast-xml-parser collapses singletons into objects
// and the walker has to branch on shape per node.
const ARRAY_NODES = new Set([
  "selectionEntry",
  "selectionEntryGroup",
  "sharedSelectionEntry",
  "sharedSelectionEntryGroup",
  "entryLink",
  "categoryLink",
  "cost",
  "constraint",
  "modifier",
  "modifierGroup",
  "condition",
  "conditionGroup",
  "repeat",
]);

/**
 * Parse one BattleScribe .cat XML string into a flat list of selection-entry
 * records. Each record carries everything the walker in build-index.mjs needs
 * to resolve cross-file entryLink references and decide whether the entry
 * represents a costed datasheet.
 *
 * Returned shape per entry:
 *   {
 *     id, name, type,
 *     categoryLinks: string[],   // uppercased, "Faction: X" prefix stripped
 *     entryLinks:    string[],   // targetIds the walker must resolve
 *     hasPts:        boolean,    // entry (or any nested entry) carries a pts cost
 *     children:      Entry[],    // nested selectionEntry / selectionEntryGroup
 *   }
 *
 * Both `selectionEntry` and `sharedSelectionEntry` are emitted — BSData
 * promotes shared entries to the catalogue's `<sharedSelectionEntries>` block
 * so they can be linked from multiple parent groups; for our purposes they're
 * datasheets just like inline entries.
 */
export function parseCatFile(xml) {
  const tree = parser.parse(xml);
  const root = tree.catalogue ?? tree.gameSystem;
  if (!root) return [];

  const entries = [];
  collectFromNode(root, entries);
  return entries;
}

function collectFromNode(node, out) {
  if (!node || typeof node !== "object") return;

  for (const key of [
    "sharedSelectionEntries",
    "sharedSelectionEntryGroups",
    "selectionEntries",
    "selectionEntryGroups",
  ]) {
    const container = node[key];
    if (!container) continue;
    for (const child of asArray(container.selectionEntry)) {
      out.push(buildEntry(child));
    }
    for (const child of asArray(container.selectionEntryGroup)) {
      out.push(buildEntry(child));
    }
  }
}

function buildEntry(node) {
  const id = node["@_id"];
  // Strip the [Legends] suffix FIRST so the name-fix map lookup sees the
  // bare name. BSData carries some typo'd names under both Legends and
  // non-Legends variants — both need the fix.
  const name = applyNameFix(stripLegendsSuffix(node["@_name"] ?? ""));
  const type = node["@_type"] ?? "";

  const categoryLinks = collectCategoryLinks(node);
  const entryLinks = collectEntryLinks(node);
  const ownPts = hasOwnPts(node);

  const children = [];
  collectFromNode(node, children);

  const hasPts = ownPts || children.some((c) => c.hasPts);

  return { id, name, type, categoryLinks, entryLinks, hasPts, children };
}

function collectCategoryLinks(node) {
  const container = node.categoryLinks;
  if (!container) return [];
  const out = [];
  for (const link of asArray(container.categoryLink)) {
    const raw = link["@_name"];
    if (!raw) continue;
    const normalized = normalizeKeyword(raw);
    if (IGNORED_CATEGORY_LINKS.has(normalized)) continue;
    out.push(normalized);
  }
  return dedupePreserveOrder(out);
}

// BSData categoryLinks that are NOT real 11e datasheet keywords and would
// mislead any consumer that reads them:
//   - WARLORD: 10e marker for "this Character is eligible to be selected
//     as the army's Warlord at list-building time." In 11e the Warlord
//     designation is dynamic (assigned during the game) and doesn't appear
//     on any MFM PDF KEYWORDS line.
//   - The various "* WEAPON" tags are BSData's internal weapon-profile
//     classifications. They surface in our datasheet keyword sets because
//     the model-keyword union in build-index.mjs walks nested entries and
//     some character datasheets carry these tags on inline weapon profiles.
//     Filtering at parse time is the cleanest layer to drop them.
const IGNORED_CATEGORY_LINKS = new Set([
  "WARLORD",
  "RANGED WEAPON",
  "PISTOL WEAPON",
  "BOLT WEAPON",
  "MELEE WEAPON",
  "ATTACKS DX WEAPON",
  "DAMAGE DX WEAPON",
  "EXTRA ATTACKS WEAPON",
]);

function collectEntryLinks(node) {
  const out = [];
  const direct = node.entryLinks;
  if (direct) {
    for (const link of asArray(direct.entryLink)) {
      const target = link["@_targetId"];
      if (target) out.push(target);
    }
  }
  // Some catalogues nest entryLinks inside selectionEntries containers for
  // shared-entry promotion. The walker recurses through children anyway, so
  // top-level direct links are enough here.
  return out;
}

function hasOwnPts(node) {
  const costs = node.costs;
  if (!costs) return false;
  for (const cost of asArray(costs.cost)) {
    if (cost["@_name"] === "pts") {
      const value = Number(cost["@_value"] ?? 0);
      if (!Number.isNaN(value) && value > 0) return true;
      // Free units (0 pts) are still datasheets — Astartes Drop Pod etc.
      // Treat presence of a pts cost as the signal, value-agnostic.
      return true;
    }
  }
  return false;
}

// Normalize one BattleScribe category-link name into our keyword convention:
//   "Faction: Astra Militarum"  → "ASTRA MILITARUM"
//   "Sub-faction: Phalanx"      → "PHALANX"
//   "Epic Hero"                 → "EPIC HERO"
//   "Imperium"                  → "IMPERIUM"
// We strip namespacing prefixes (the colon-space is awkward downstream) and
// uppercase to match the MFM-side convention (`requiredKeywords` arrays in
// enhancement-restrictions.auto.json, faction names elsewhere).
function normalizeKeyword(raw) {
  let s = String(raw).trim();
  const colonIdx = s.indexOf(":");
  if (colonIdx !== -1) s = s.slice(colonIdx + 1).trim();
  return s.toUpperCase();
}

// MFM tracks Legends status as a `legends: true` flag on the datasheet; BSData
// suffixes the name as "Foo [Legends]". Strip so name-based lookup matches
// MFM directly without per-unit suffix bookkeeping.
function stripLegendsSuffix(name) {
  return String(name).replace(/\s*\[Legends\]\s*$/i, "").trim();
}

// One-off corrections for BSData datasheet names that don't match MFM 11e
// spelling. Exact-match (case-sensitive) to keep this list auditable —
// every entry needs a clear "BSData is wrong, MFM is right" justification.
// Applied AFTER stripLegendsSuffix so a "Ferren Areios [Legends]" entry's
// stripped name "Ferren Areios" can be matched and fixed.
const BSDATA_NAME_FIXES = {
  // US "Armor" vs UK "Armour" — only BSData entry with the US spelling;
  // every other "Armour" datasheet in BSData uses UK spelling.
  "Ancient in Terminator Armor": "Ancient in Terminator Armour",
  // BSData typo / older spelling. MFM 11e is FERREN AERIOS (A-E-R-I-O-S).
  "Ferren Areios": "Ferren Aerios",
};

function applyNameFix(rawName) {
  return BSDATA_NAME_FIXES[rawName] ?? rawName;
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function dedupePreserveOrder(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}
