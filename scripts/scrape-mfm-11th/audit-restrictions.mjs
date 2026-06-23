// Build-time tripwire for the enhancement-restrictions auto layers (MFM-PDF
// and BSData).
//
// Loads each auto.json + the three keyword layers, builds the global keyword
// vocabulary, and reports every `requiredKeywords` entry that isn't in the
// vocab. A clean run prints nothing and exits 0; a dirty run lists every
// offender so a maintainer can see what an extraction layer emitted that the
// runtime validator can never satisfy.
//
// Currently warn-only (exit 0).
//
// Run with: `node scripts/scrape-mfm-11th/audit-restrictions.mjs`

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildKeywordVocab, splitAgainstVocab } from "./keyword-vocab.mjs";
import { resolveSnapshotStateSync } from "./snapshot-resolve.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESTRICTIONS_PATHS = [
  {
    label: "MFM-PDF auto.json",
    path: resolve(
      __dirname,
      "../../src/data/configs/enhancement-restrictions.auto.json"
    ),
  },
  {
    label: "BSData auto.json",
    path: resolve(
      __dirname,
      "../../src/data/configs/enhancement-restrictions.bsdata.auto.json"
    ),
  },
];

const { global: vocab } = buildKeywordVocab();

let total = 0;
let unmatched = 0;
const offenders = [];

for (const { label, path } of RESTRICTIONS_PATHS) {
  let restrictions;
  try {
    restrictions = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    continue; // file may not exist yet on a partial run
  }
  for (const [faction, enhs] of Object.entries(restrictions)) {
    if (faction.startsWith("_") || !enhs || typeof enhs !== "object") continue;
    for (const [eName, r] of Object.entries(enhs)) {
      const reqs = r?.requiredKeywords;
      if (!Array.isArray(reqs)) continue;
      for (const k of reqs) {
        total++;
        if (vocab.has(k)) continue;
        unmatched++;
        const split = splitAgainstVocab(k, vocab);
        offenders.push({ source: label, faction, eName, k, split });
      }
    }
  }
}

console.log(`Checked ${total} requiredKeywords entry/entries across enhancement-restrictions auto layers.`);
if (unmatched === 0) {
  console.log("Clean: every entry matches a keyword in the merged vocabulary.");
} else {
  console.log(`${unmatched} entry/entries NOT in the keyword vocabulary:\n`);
  const byFaction = {};
  for (const o of offenders) (byFaction[o.faction] ??= []).push(o);
  for (const f of Object.keys(byFaction).sort()) {
    console.log(`  [${f}]`);
    for (const o of byFaction[f]) {
      const hint = o.split ? ` → split: ${JSON.stringify(o.split)}` : " (no vocab decomposition)";
      console.log(`    ${o.eName}: "${o.k}"${hint}  [${o.source}]`);
    }
  }
  console.log();
  console.log("These entries will be unsatisfiable by the runtime validator:");
  console.log("  src/stores/armyList.js (requiredKeywords.every(k => hostKeywords.has(k)))");
  console.log("Re-run `node scripts/scrape-mfm-11th/index.mjs` to regenerate, or add overrides");
  console.log("to src/data/configs/enhancement-restrictions.manual.json.");
}

// ---- Second pass: allowedHosts entries vs. the MFM datasheet roster. ----
//
// The runtime matches host.name byte-for-byte against each `allowedHosts`
// string. An entry that doesn't correspond to any real MFM datasheet name
// (typo, apostrophe drift, BSData-only variant like "FOO [CRUCIBLE]") will
// never match — silently unenforceable. Walk the latest MFM snapshot and
// report any allowedHosts entry that doesn't land on a real faction
// datasheet name. Warn-only; same posture as the keyword-vocab check above.

const MFM_ROOT = resolve(__dirname, "../../src/data/munitorum-field-manual-11th");
const datasheetsByFaction = loadMfmDatasheetNames(MFM_ROOT);

let hostsChecked = 0;
let hostsOrphaned = 0;
const hostOrphans = [];

for (const { label, path } of RESTRICTIONS_PATHS) {
  let restrictions;
  try {
    restrictions = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    continue;
  }
  for (const [faction, enhs] of Object.entries(restrictions)) {
    if (faction.startsWith("_") || !enhs || typeof enhs !== "object") continue;
    const factionDs = datasheetsByFaction.get(faction);
    if (!factionDs) continue;
    for (const [eName, r] of Object.entries(enhs)) {
      const hosts = r?.allowedHosts;
      if (!Array.isArray(hosts)) continue;
      for (const h of hosts) {
        hostsChecked++;
        if (factionDs.has(h)) continue;
        hostsOrphaned++;
        hostOrphans.push({ source: label, faction, eName, host: h });
      }
    }
  }
}

console.log();
console.log(`Checked ${hostsChecked} allowedHosts entry/entries against the MFM datasheet roster.`);
if (hostsOrphaned === 0) {
  console.log("Clean: every entry matches a real MFM datasheet name.");
  process.exit(0);
}

console.log(`${hostsOrphaned} entry/entries NOT in the MFM datasheet roster:\n`);
const hostsByFaction = {};
for (const o of hostOrphans) (hostsByFaction[o.faction] ??= []).push(o);
for (const f of Object.keys(hostsByFaction).sort()) {
  console.log(`  [${f}]`);
  for (const o of hostsByFaction[f]) {
    console.log(`    ${o.eName}: "${o.host}"  [${o.source}]`);
  }
}
console.log();
console.log("These entries will never satisfy the runtime's byte-exact name match.");
console.log("Likely causes: scraper typo, apostrophe drift, BSData-only variant (e.g. '[CRUCIBLE]').");
process.exit(0);

// Walk the resolved (overlay) MFM snapshot state and return a per-faction
// Set of canonical datasheet names. Mirrors the technique in
// scripts/scrape-bsdata-enhancements/index.mjs `loadMfmEnhancementNames`.
function loadMfmDatasheetNames(mfmRoot) {
  const resolved = resolveSnapshotStateSync(mfmRoot);
  if (!resolved) return new Map();
  const out = new Map();
  for (const payload of Object.values(resolved.factions)) {
    const factionName = payload.faction;
    if (!factionName) continue;
    const names = new Set();
    for (const ds of payload.datasheets ?? []) {
      if (ds.name) names.add(ds.name);
    }
    out.set(factionName, names);
  }
  return out;
}
