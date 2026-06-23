#!/usr/bin/env node
/**
 * Audit + prune `src/data/keywords/manual-overrides.json` against the
 * upstream keyword sources.
 *
 * Two-step pipeline:
 *
 *   1. AUDIT: walk every override key and classify it against MFM datasheet
 *      names under its faction. Auto-correct casing (rewrite to MFM
 *      canonical) and clean suffix renames ("Warsmith Kravek Morne" → MFM
 *      "Kravek Morne"). Flag truly dead entries for manual review.
 *
 *   2. PRUNE + EXPAND: re-evaluate each override against the union of
 *      `bsdata-keywords.auto.json` ∪ `mfm-pdf-keywords.auto.json`:
 *        (a) Drop overrides that same-faction upstream now covers in full
 *            (redundant). Cross-faction matches do NOT count toward "fully
 *            covered" — the runtime loader doesn't cross-faction lookup,
 *            so dropping a cross-faction-only override would erase its
 *            datasheet's keywords at runtime.
 *        (b) For kept overrides, expand the keyword array to be
 *            upstream ∪ override. Required because the runtime loader uses
 *            replace-on-conflict at the datasheet level — manual wins, so
 *            its value must carry the FULL intended keyword set, not just
 *            the missing patch.
 *
 * Idempotent. Run after every BSData / PDF refresh.
 *
 * Run via `npm run bsdata:prune-overrides`.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSnapshotState } from "./scrape-mfm-11th/snapshot-resolve.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const BSDATA_PATH = resolve(
  REPO_ROOT,
  "src",
  "data",
  "keywords",
  "bsdata-keywords.auto.json"
);
const MFM_PDF_PATH = resolve(
  REPO_ROOT,
  "src",
  "data",
  "keywords",
  "mfm-pdf-keywords.auto.json"
);
const OVERRIDES_PATH = resolve(
  REPO_ROOT,
  "src",
  "data",
  "keywords",
  "manual-overrides.json"
);
const MFM_SNAPSHOT_ROOT = resolve(
  REPO_ROOT,
  "src",
  "data",
  "munitorum-field-manual-11th"
);

const OVERRIDES_COMMENT =
  "Hand-curated keyword overrides for datasheets BSData hasn't picked up (typically new 11e units added between BSData ref bumps) or where BSData's classification is wrong for 11e. Audited + pruned by scripts/audit-and-prune-overrides.mjs after every BSData / PDF refresh. Shape mirrors bsdata-keywords.auto.json — overrides win on conflict at the datasheet level (the whole keyword array is replaced, not unioned).";

function normalizeName(s) {
  return String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Build a single coverage lookup from one or more upstream keyword sources
// (BSData + PDF). Keys are normalized `faction::datasheet`; values are the
// union of keywords across every source that names the datasheet. A manual
// override is considered "fully covered" iff every keyword it carries is in
// this union — at which point dropping the override changes nothing.
function buildUpstreamLookup(sources) {
  const lookup = new Map();
  for (const source of sources) {
    if (!source) continue;
    for (const [factionName, sheets] of Object.entries(source)) {
      if (factionName.startsWith("_")) continue;
      if (!sheets || typeof sheets !== "object") continue;
      const factionKey = normalizeName(factionName);
      for (const [sheetName, keywords] of Object.entries(sheets)) {
        if (!Array.isArray(keywords)) continue;
        const k = `${factionKey}::${normalizeName(sheetName)}`;
        if (!lookup.has(k)) lookup.set(k, new Set());
        const set = lookup.get(k);
        for (const kw of keywords) set.add(kw);
      }
    }
  }
  return lookup;
}

// Secondary index keyed by normalized datasheet name → list of { factionKey,
// keywords } across every faction that names the datasheet. Used for the
// cross-faction fallback in the prune-mode expansion: if the same-faction
// upstream lookup is empty but EXACTLY one other faction carries the same
// datasheet name, we inherit that faction's keyword set. Datasheets shared
// across multiple factions (Chaos Rhino, Chaos Lord, Daemonettes, etc.)
// stay un-inherited because their sub-faction tags would bleed across.
function buildNameOnlyIndex(upstreamLookup) {
  const out = new Map();
  for (const [key, keywords] of upstreamLookup.entries()) {
    const sep = key.indexOf("::");
    const factionKey = key.slice(0, sep);
    const name = key.slice(sep + 2);
    if (!out.has(name)) out.set(name, []);
    out.get(name).push({ factionKey, keywords });
  }
  return out;
}

async function loadJsonOrEmpty(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return {};
  }
}

// Load the resolved (overlay across all snapshots) per-faction datasheet
// name lists. Used by the audit step to detect manual-override keys that
// don't correspond to a real MFM datasheet (stale entries from earlier
// editions or renamed datasheets). Returns
// `{ [factionName]: { rawNames: string[], byNorm: Map<normName, rawName> } }`.
async function loadMfmDatasheets() {
  const resolved = await resolveSnapshotState(MFM_SNAPSHOT_ROOT);
  if (!resolved) return {};
  const out = {};
  for (const data of Object.values(resolved.factions)) {
    const rawNames = data.datasheets.map((d) => d.name);
    const byNorm = new Map();
    for (const n of rawNames) byNorm.set(normalizeName(n), n);
    out[data.faction] = { rawNames, byNorm };
  }
  return out;
}

/**
 * Walk the overrides object and classify each entry's key against MFM
 * datasheet names under its faction. Returns the rewritten overrides + a
 * report. Categories:
 *   - EXACT: normalized key matches a real MFM datasheet. OK.
 *   - CASING_DIFF: normalized match, raw casing differs. Auto-rewrite key
 *     to the MFM casing.
 *   - MISMATCH_WITH_CANDIDATE: no normalized match, but exactly one MFM
 *     datasheet's normalized name is a SUFFIX of the override key (e.g.
 *     override "Warsmith Kravek Morne" → MFM "Kravek Morne"). Auto-rename.
 *   - DEAD: no match and no clean suffix candidate. Kept verbatim; the
 *     caller surfaces a manual-review warning.
 *
 * Faction-level: if a manual entry's faction isn't in MFM at all, every
 * entry under it is classified DEAD with a "faction not in MFM" reason —
 * lookups under that faction never reach the runtime.
 */
function auditAndAutoCorrect(overrides, mfm) {
  const fixed = {};
  const report = {
    exact: 0,
    casingFixed: [],
    renamed: [],
    dead: [],
  };
  for (const [faction, sheets] of Object.entries(overrides)) {
    if (faction.startsWith("_")) {
      fixed[faction] = sheets;
      continue;
    }
    const mfmFaction = mfm[faction];
    if (!mfmFaction) {
      // Faction missing from MFM entirely — every entry under it is DEAD.
      for (const overrideName of Object.keys(sheets)) {
        report.dead.push({
          faction,
          override: overrideName,
          reason: "faction not in MFM",
          candidates: [],
        });
      }
      fixed[faction] = sheets;
      continue;
    }
    const factionFixed = {};
    for (const [overrideName, keywords] of Object.entries(sheets)) {
      const norm = normalizeName(overrideName);
      const exactMfm = mfmFaction.byNorm.get(norm);
      if (exactMfm) {
        if (exactMfm !== overrideName) {
          // CASING_DIFF: rewrite the key to MFM's casing.
          factionFixed[exactMfm] = keywords;
          report.casingFixed.push({
            faction,
            from: overrideName,
            to: exactMfm,
          });
        } else {
          factionFixed[overrideName] = keywords;
          report.exact++;
        }
        continue;
      }
      // No exact normalized match — search for a clean suffix candidate:
      // exactly one MFM datasheet whose normalized name is a strict suffix
      // of the override's normalized name (i.e. override has an extra
      // title prefix).
      const suffixCandidates = [];
      for (const [mfmNorm, mfmRaw] of mfmFaction.byNorm) {
        if (mfmNorm !== norm && norm.endsWith(mfmNorm)) {
          suffixCandidates.push(mfmRaw);
        }
      }
      if (suffixCandidates.length === 1) {
        const target = suffixCandidates[0];
        factionFixed[target] = keywords;
        report.renamed.push({ faction, from: overrideName, to: target });
        continue;
      }
      // DEAD: keep verbatim, flag for manual review with substring hints.
      const hints = [];
      for (const [mfmNorm, mfmRaw] of mfmFaction.byNorm) {
        if (mfmNorm.includes(norm) || norm.includes(mfmNorm)) hints.push(mfmRaw);
      }
      factionFixed[overrideName] = keywords;
      report.dead.push({
        faction,
        override: overrideName,
        reason: suffixCandidates.length > 1
          ? `${suffixCandidates.length} ambiguous suffix candidates`
          : "no MFM datasheet matches",
        candidates: hints,
      });
    }
    fixed[faction] = factionFixed;
  }
  return { fixed, report };
}

function printAuditReport(report) {
  const { exact, casingFixed, renamed, dead } = report;
  console.log(
    `Audit: ${exact} exact, ${casingFixed.length} casing-corrected, ` +
      `${renamed.length} renamed to MFM canonical, ${dead.length} dead.`
  );
  for (const c of casingFixed) {
    console.log(`  [casing] ${c.faction} / "${c.from}" → "${c.to}"`);
  }
  for (const r of renamed) {
    console.log(`  [rename] ${r.faction} / "${r.from}" → "${r.to}"`);
  }
  for (const d of dead) {
    const hint = d.candidates.length
      ? ` — candidates: ${d.candidates.slice(0, 5).join(", ")}`
      : "";
    console.log(`  [DEAD]   ${d.faction} / "${d.override}" (${d.reason})${hint}`);
  }
}

function sortObjectByKey(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sortObjectByKey(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function writeOverrides(merged, dryRun) {
  if (dryRun) {
    console.log("Dry-run — not writing.");
    return;
  }
  const sorted = sortObjectByKey(merged);
  const output = { _comment: OVERRIDES_COMMENT, ...sorted };
  await writeFile(OVERRIDES_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`Wrote ${OVERRIDES_PATH}`);
}

async function runPruneAgainstUpstream(dryRun) {
  const [bsdata, mfmPdf, overridesRaw, mfm] = await Promise.all([
    loadJsonOrEmpty(BSDATA_PATH),
    loadJsonOrEmpty(MFM_PDF_PATH),
    readFile(OVERRIDES_PATH, "utf8"),
    loadMfmDatasheets(),
  ]);
  const rawOverrides = JSON.parse(overridesRaw);
  // Audit before prune: detect stale keys (renamed datasheets, moved
  // factions) and auto-correct casing/suffix mismatches. The corrected
  // overrides then feed into the prune+expand loop, so a renamed key gets
  // a chance to be matched against upstream and dropped if redundant.
  const { fixed: overrides, report: auditReport } = auditAndAutoCorrect(
    rawOverrides,
    mfm
  );
  printAuditReport(auditReport);
  const upstream = buildUpstreamLookup([bsdata, mfmPdf]);
  const byName = buildNameOnlyIndex(upstream);

  const pruned = {};
  let kept = 0;
  let expanded = 0;
  let crossFactionExpanded = 0;
  let droppedRedundant = 0;
  const droppedNames = [];
  for (const [factionName, sheets] of Object.entries(overrides)) {
    if (factionName.startsWith("_")) continue;
    const factionKey = normalizeName(factionName);
    for (const [sheetName, keywords] of Object.entries(sheets)) {
      const datasheetKey = normalizeName(sheetName);
      const lookupKey = `${factionKey}::${datasheetKey}`;

      // Same-faction upstream wins for the "fully covered → drop" decision.
      // The runtime loader ONLY does same-faction lookup — if the override is
      // already a subset of same-faction upstream, dropping it is a runtime
      // no-op (BSData/PDF take over).
      const sameFactionUpstream = upstream.get(lookupKey);
      const fullyCovered =
        sameFactionUpstream && keywords.every((k) => sameFactionUpstream.has(k));
      if (fullyCovered) {
        droppedRedundant++;
        droppedNames.push(`${factionName}: ${sheetName}`);
        continue;
      }

      // Otherwise resolve the expansion source for the kept override:
      //   (a) same-faction upstream entry (if any), OR
      //   (b) the UNIQUE other faction that carries the same datasheet name
      //       — cross-faction fallback for Ultramarines characters MFM-filed
      //       under SPACE MARINES vs BSData-filed under ULTRAMARINES.
      //   Multi-faction matches (Chaos Rhino, Chaos Lord, …) stay un-inherited
      //   because their sub-faction tags would bleed across.
      // CRUCIAL: a cross-faction expansion source does NOT count toward the
      // "fully covered" drop check above. The runtime loader doesn't do
      // cross-faction lookups, so dropping a manual entry whose only
      // upstream coverage is in a different faction would silently erase
      // the datasheet's keywords at runtime.
      let expansionSource = sameFactionUpstream;
      let crossFactionHit = false;
      if (!expansionSource) {
        const others = (byName.get(datasheetKey) ?? []).filter(
          (m) => m.factionKey !== factionKey
        );
        if (others.length === 1) {
          expansionSource = others[0].keywords;
          crossFactionHit = true;
        }
      }

      // Keep, expand to expansionSource ∪ override so the runtime's
      // replace-on-conflict semantics don't truncate to just the patch.
      const merged = new Set(keywords);
      if (expansionSource) {
        for (const k of expansionSource) merged.add(k);
        if (merged.size > keywords.length) {
          expanded++;
          if (crossFactionHit) crossFactionExpanded++;
        }
      }
      if (!pruned[factionName]) pruned[factionName] = {};
      pruned[factionName][sheetName] = [...merged].sort();
      kept++;
    }
  }

  console.log(
    `Prune mode: kept ${kept} overrides (${expanded} expanded with upstream,` +
      ` ${crossFactionExpanded} via cross-faction fallback),` +
      ` dropped ${droppedRedundant} now-redundant entries.`
  );
  if (droppedNames.length > 0 && droppedNames.length <= 50) {
    console.log("Dropped:");
    for (const n of droppedNames) console.log(`  - ${n}`);
  } else if (droppedNames.length > 50) {
    console.log(`Dropped ${droppedNames.length} entries (first 20):`);
    for (const n of droppedNames.slice(0, 20)) console.log(`  - ${n}`);
  }
  await writeOverrides(pruned, dryRun);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await runPruneAgainstUpstream(dryRun);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
