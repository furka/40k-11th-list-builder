/**
 * Walk parsed catalogue entries and produce a per-faction
 * `datasheetName → keywords[]` map.
 *
 * BattleScribe splits faction data across thin-shim files and shared
 * Library catalogues: a chapter file (Imperium - Ultramarines.cat) carries
 * mostly `<entryLink>` references back to its parent library
 * (Imperium - Space Marines.cat). To enumerate every datasheet for an MFM
 * faction we need a two-pass resolve:
 *   1. Build a global `Map<id, entry>` across every file we touched.
 *   2. For each MFM faction, walk only the files mapped to it, including
 *      transitively-linked entries by id.
 *
 * A datasheet is any selection entry with `type ∈ {"unit", "model"}` (BSData
 * uses `type="model"` for single-model characters like the Captain) and at
 * least one `pts` cost somewhere in its subtree (filters out wargear-only
 * upgrade entries that share the same XML shape).
 *
 * Keyword union for a datasheet is the union of category links on the entry
 * itself plus the union of every linked-in entry resolved through entryLinks
 * — so chapter-shim units inherit the categoryLinks declared on their library
 * entry. The shim itself sometimes pins chapter-specific tags
 * (`Faction: Ultramarines`), so we keep both sources.
 */

const DATASHEET_TYPES = new Set(["unit", "model"]);

export function buildKeywordsByFaction(parsedByFile, factionMapping) {
  const globalIndex = buildGlobalIndex(parsedByFile);

  const out = {};
  for (const [factionName, files] of Object.entries(factionMapping)) {
    if (factionName.startsWith("_")) continue;
    const factionEntries = collectFactionEntries(files, parsedByFile);
    const byName = {};
    for (const entry of factionEntries) {
      const resolved = resolveEntry(entry, globalIndex);
      if (!isDatasheet(resolved)) continue;
      const name = resolved.name;
      if (!name) continue;
      const keywords = unionKeywords(resolved, globalIndex);
      // If we hit the same name twice (e.g. a shim + its linked library copy
      // resolve to differently-tagged objects), union the keyword sets so
      // both perspectives contribute.
      if (byName[name]) {
        const merged = new Set([...byName[name], ...keywords]);
        byName[name] = [...merged].sort();
      } else {
        byName[name] = keywords;
      }
    }
    out[factionName] = sortObjectByKey(byName);
  }
  return out;
}

function buildGlobalIndex(parsedByFile) {
  const index = new Map();
  for (const entries of Object.values(parsedByFile)) {
    walkEntries(entries, (entry) => {
      if (entry.id) index.set(entry.id, entry);
    });
  }
  return index;
}

function collectFactionEntries(files, parsedByFile) {
  const out = [];
  for (const file of files) {
    const entries = parsedByFile[file];
    if (!entries) continue;
    walkEntries(entries, (entry) => out.push(entry));
  }
  return out;
}

function walkEntries(entries, visit) {
  for (const entry of entries) {
    visit(entry);
    if (entry.children?.length) walkEntries(entry.children, visit);
  }
}

// "Resolve" a thin shim entry into its target by following entryLinks until we
// land on something that looks like a real datasheet definition. Most shim
// entries hold zero categoryLinks of their own; the link target carries the
// taxonomy. When the entry already has keywords + costs we trust it as-is.
function resolveEntry(entry, globalIndex) {
  if (entry.categoryLinks.length > 0 && entry.hasPts) return entry;
  if (entry.entryLinks.length === 0) return entry;
  const targetId = entry.entryLinks[0];
  const target = globalIndex.get(targetId);
  if (!target) return entry;
  return target;
}

function isDatasheet(entry) {
  if (!DATASHEET_TYPES.has(entry.type)) return false;
  return entry.hasPts;
}

function unionKeywords(entry, globalIndex) {
  const set = new Set(entry.categoryLinks);
  // Shim → library: union categoryLinks from any entryLink targets.
  for (const linkId of entry.entryLinks) {
    const target = globalIndex.get(linkId);
    if (!target) continue;
    for (const kw of target.categoryLinks) set.add(kw);
  }
  // Walk nested model-type descendants and union THEIR categoryLinks too.
  // BSData files some keywords at the model level — CHARACTER on the leader
  // model of multi-model datasheets like Saint Celestine + Geminae Superia,
  // Gaunt's Ghosts, Chaplain Grimaldus + Cenobyte Servitors. Without this
  // walk the datasheet would never see CHARACTER even though its leader has
  // it, leaving consumers to paper over the gap via manual-overrides. Filter
  // to model/unit types so weapon-option keywords on `type="upgrade"` entries
  // don't bleed in.
  function walkModels(e) {
    for (const child of e.children ?? []) {
      if (child.type === "model" || child.type === "unit") {
        for (const kw of child.categoryLinks) set.add(kw);
        for (const linkId of child.entryLinks) {
          const target = globalIndex.get(linkId);
          if (target && (target.type === "model" || target.type === "unit")) {
            for (const kw of target.categoryLinks) set.add(kw);
          }
        }
      }
      walkModels(child);
    }
  }
  walkModels(entry);
  return [...set].sort();
}

function sortObjectByKey(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key];
  return out;
}
