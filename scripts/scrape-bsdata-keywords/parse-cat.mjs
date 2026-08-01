import { normalizeApostrophes } from "../../src/utils/apostrophe-normalization.js";
import { parseCatalogue, asArray } from "./parse-catalogue.mjs";

// BSData JSON stores selection entries and groups in separate plural-keyed
// arrays; both shared and inline variants get walked as datasheet candidates.
const ENTRY_CONTAINERS = ["sharedSelectionEntries", "selectionEntries"];
const GROUP_CONTAINERS = ["sharedSelectionEntryGroups", "selectionEntryGroups"];

/**
 * Parse one BattleScribe catalogue JSON string into a flat list of
 * selection-entry records. Each record carries everything the walker in
 * build-index.mjs needs to resolve cross-file entryLink references and decide
 * whether the entry represents a costed datasheet.
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
 * Both `selectionEntries` and `sharedSelectionEntries` are emitted — BSData
 * promotes shared entries to the catalogue's `sharedSelectionEntries` block so
 * they can be linked from multiple parent groups; for our purposes they're
 * datasheets just like inline entries.
 */
export function parseCatFile(text) {
  const root = parseCatalogue(text);
  if (!root) return [];

  const entries = [];
  collectFromNode(root, entries);
  return entries;
}

function collectFromNode(node, out) {
  if (!node || typeof node !== "object") return;

  for (const key of ENTRY_CONTAINERS) {
    for (const child of asArray(node[key])) out.push(buildEntry(child));
  }
  for (const key of GROUP_CONTAINERS) {
    for (const child of asArray(node[key])) out.push(buildEntry(child));
  }
}

function buildEntry(node) {
  const id = node.id;
  // Strip the [Legends] suffix FIRST so the name-fix map lookup sees the
  // bare name. BSData carries some typo'd names under both Legends and
  // non-Legends variants — both need the fix. Apostrophe normalization runs
  // last so any byte form returned by the fix map ends up canonical.
  const name = normalizeApostrophes(
    applyNameFix(stripLegendsSuffix(node.name ?? ""))
  );
  const type = node.type ?? "";

  const categoryLinks = collectCategoryLinks(node);
  const entryLinks = collectEntryLinks(node);
  const ownPts = hasOwnPts(node);

  const children = [];
  collectFromNode(node, children);

  const hasPts = ownPts || children.some((c) => c.hasPts);

  return { id, name, type, categoryLinks, entryLinks, hasPts, children };
}

function collectCategoryLinks(node) {
  const out = [];
  for (const link of asArray(node.categoryLinks)) {
    const raw = link.name;
    if (!raw) continue;
    const normalized = normalizeKeyword(raw);
    if (IGNORED_CATEGORY_LINKS.has(normalized)) continue;
    out.push(normalized);
  }
  return dedupePreserveOrder(out);
}

// BSData categoryLinks that are NOT real 11e datasheet keywords and would
// mislead any consumer that reads them:
//   - WARLORD: BSData marks Characters eligible to be the army's Warlord with
//     this category. In 11e the Warlord designation is dynamic (assigned
//     during the game) and doesn't appear on any MFM PDF KEYWORDS line.
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
  for (const link of asArray(node.entryLinks)) {
    const target = link.targetId;
    if (target) out.push(target);
  }
  // Some catalogues nest entryLinks inside selectionEntries containers for
  // shared-entry promotion. The walker recurses through children anyway, so
  // top-level direct links are enough here.
  return out;
}

function hasOwnPts(node) {
  for (const cost of asArray(node.costs)) {
    if (cost.name === "pts") {
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
  return normalizeApostrophes(s.toUpperCase());
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
