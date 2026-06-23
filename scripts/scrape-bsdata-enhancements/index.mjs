#!/usr/bin/env node
/**
 * Scrape per-faction enhancement restrictions from BSData/wh40k-10e and emit a
 * lowest-priority overlay JSON the app merges in on top of MFM-PDF and manual
 * layers at runtime.
 *
 * Run: `npm run bsdata:enhancements` (or `:refresh` to bypass on-disk cache).
 *
 * Same tag-pin strategy as the keyword scraper: resolve BSData's `main` to a
 * commit SHA at scrape time, cache by SHA. Reuses fetch/cache and the faction
 * mapping from the sibling keyword scraper — no duplication.
 *
 * The runtime priority is manual > MFM-PDF auto > BSData auto. BSData fills
 * the codex-resident gap MFM-PDF can't see (~659 enhancements stripped from
 * the Faction Pack PDFs once their codex ships).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchCatFile } from "../scrape-bsdata-keywords/fetch.mjs";
import {
  parseCatRaw,
  buildIdIndex,
  iterEnhancements,
  analyzeEnhancement,
} from "./extract-enhancements.mjs";
import { resolveSnapshotState } from "../scrape-mfm-11th/snapshot-resolve.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const BSDATA_REF = "main";
const BSDATA_REPO = "BSData/wh40k-10e";

const MAPPING_PATH = resolve(
  __dirname,
  "..",
  "scrape-bsdata-keywords",
  "faction-mapping.json"
);
const OUTPUT_PATH = resolve(
  REPO_ROOT,
  "src",
  "data",
  "configs",
  "enhancement-restrictions.bsdata.auto.json"
);

async function main() {
  const refresh = process.argv.includes("--refresh");
  const mapping = JSON.parse(await readFile(MAPPING_PATH, "utf8"));

  const factions = Object.keys(mapping).filter((k) => !k.startsWith("_"));
  const filesNeeded = new Set();
  for (const f of factions) for (const file of mapping[f]) filesNeeded.add(file);

  const { sha, committedAt } = await resolveRef(BSDATA_REPO, BSDATA_REF);
  console.log(
    `BSData enhancement scrape — ref ${BSDATA_REF} @ ${sha.slice(0, 8)} ` +
      `(${committedAt}), ${factions.length} factions, ` +
      `${filesNeeded.size} unique .cat files` +
      `${refresh ? " (cache bypass)" : ""}`
  );

  const rootsByFile = {};
  for (const file of filesNeeded) {
    const xml = await fetchCatFile(sha, file, { refresh });
    rootsByFile[file] = xml === null ? null : parseCatRaw(xml);
    process.stdout.write(xml === null ? "x" : ".");
  }
  process.stdout.write("\n");

  // The global ID index spans every file so condition.childId references
  // pointing into a sibling .cat (e.g. a Space Marines library) resolve.
  const idIndex = buildIdIndex(rootsByFile);
  console.log(`Indexed ${idIndex.size} ids across all catalogues.`);

  // Use MFM data as ground truth for "which enhancement names belong to
  // which faction." BSData's shared library files (e.g. Imperium - Space
  // Marines.cat) carry generic SM enhancements that ALSO appear in BT/BA/etc.
  // mappings, so without this filter every chapter faction would get the
  // same 155 generic SM enhancements attributed to it. MFM lists each
  // enhancement under exactly one faction (in its detachments), so we mirror
  // that attribution.
  const mfmEnhancementsByFaction = await loadMfmEnhancementNames();

  // BSData keyword data is needed to convert multi-keyword OR conditions
  // (the common Necron Cursed Circlet pattern, "CRYPTEK OR OVERLORD OR …")
  // into a concrete allowedHosts datasheet enumeration. Read the keyword
  // scrape's output directly — it's a sibling auto.json the keyword scraper
  // already maintains.
  const keywordsAutoPath = resolve(
    REPO_ROOT,
    "src",
    "data",
    "keywords",
    "bsdata-keywords.auto.json"
  );
  const keywordsAuto = JSON.parse(await readFile(keywordsAutoPath, "utf8"));

  const restrictionsByFaction = {};
  const stats = {
    total: 0,
    withAllowedHosts: 0,
    withReqKeywords: 0,
    skippedNoMatchInMfm: 0,
    skippedNoRestrictions: 0,
  };
  for (const factionName of factions) {
    const factionFiles = mapping[factionName];
    const mfmNames = mfmEnhancementsByFaction.get(factionName);
    if (!mfmNames || mfmNames.size === 0) {
      console.log(
        `  ${factionName.padEnd(22)} 0 (no MFM enhancements for this faction)`
      );
      continue;
    }
    // Per-faction keyword overlay for the multi-keyword OR → allowedHosts
    // enumeration. Skip header keys (anything starting with "_").
    const factionKeywords = keywordsAuto[factionName] ?? null;
    const byName = {};
    for (const file of factionFiles) {
      const root = rootsByFile[file];
      if (!root) continue;
      for (const entry of iterEnhancements(root)) {
        const r = analyzeEnhancement(entry, idIndex, factionKeywords);
        if (!r.name) continue;
        const { name, ...restriction } = r;
        if (!mfmNames.has(name)) {
          stats.skippedNoMatchInMfm++;
          continue;
        }
        if (Object.keys(restriction).length === 0) {
          stats.skippedNoRestrictions++;
          continue;
        }
        if (byName[name] && !deepEqual(byName[name], restriction)) {
          continue;
        }
        byName[name] = restriction;
      }
    }
    if (Object.keys(byName).length > 0) {
      restrictionsByFaction[factionName] = sortObjectByKey(byName);
      for (const r of Object.values(byName)) {
        stats.total++;
        if (r.allowedHosts?.length) stats.withAllowedHosts++;
        if (r.requiredKeywords?.length) stats.withReqKeywords++;
      }
    }
    console.log(
      `  ${factionName.padEnd(22)} ${Object.keys(byName).length} enhancement(s)`
    );
  }

  await ensureDir(dirname(OUTPUT_PATH));
  const sortedFactions = sortObjectByKey(restrictionsByFaction);
  const payload = {
    _source: `https://github.com/${BSDATA_REPO}`,
    _ref: BSDATA_REF,
    _sha: sha,
    _committedAt: committedAt,
    _generatedAt: new Date().toISOString(),
    _generator: "scripts/scrape-bsdata-enhancements",
    ...sortedFactions,
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log(
    `\nWrote ${stats.total} enhancement(s) across ${
      Object.keys(sortedFactions).length
    } faction(s) → src/data/configs/enhancement-restrictions.bsdata.auto.json`
  );
  console.log(
    `  with allowedHosts:     ${stats.withAllowedHosts}\n` +
      `  with requiredKeywords: ${stats.withReqKeywords}\n` +
      `  skipped (not in MFM):  ${stats.skippedNoMatchInMfm}\n` +
      `  skipped (no eligibility conditions): ${stats.skippedNoRestrictions}`
  );
}

// Load the set of enhancement names per faction from the resolved MFM
// snapshot overlay. We use this as ground truth for "this name belongs to
// this faction" so cross-faction BSData shared library files don't spray
// duplicates everywhere.
//
// Reads the snapshot dirs directly via the Node-fs overlay helper rather
// than importing the runtime aggregator — the aggregator's transitive
// `import "../utils/..."` chain only resolves under Vite, not bare Node ESM.
async function loadMfmEnhancementNames() {
  const mfmRoot = resolve(REPO_ROOT, "src", "data", "munitorum-field-manual-11th");
  const resolved = await resolveSnapshotState(mfmRoot);
  if (!resolved) throw new Error("No MFM snapshot dirs found");
  const out = new Map();
  for (const payload of Object.values(resolved.factions)) {
    const factionName = payload.faction;
    if (!factionName) continue;
    const names = new Set();
    for (const det of payload.detachments ?? []) {
      for (const enh of det.enhancements ?? []) {
        if (enh.name) names.add(enh.name);
      }
    }
    out.set(factionName, names);
  }
  return out;
}

async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function resolveRef(repo, ref) {
  const url = `https://api.github.com/repos/${repo}/commits/${ref}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent":
        "40k-list-builder-bsdata/1.0 (https://github.com/furka/40k-11th-list-builder)",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to resolve ${repo}@${ref}: HTTP ${res.status}`);
  }
  const json = await res.json();
  return { sha: json.sha, committedAt: json.commit?.committer?.date ?? null };
}

function sortObjectByKey(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key];
  return out;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
