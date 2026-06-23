#!/usr/bin/env node
/**
 * Scrape per-faction wargear-option restrictions from BSData/wh40k-10e and
 * emit a `wargear-restrictions.bsdata.auto.json` overlay the parser merges
 * into MFM datasheet wargearOptions at parse time.
 *
 * Run: `npm run bsdata:wargear` (or `:refresh` to bypass on-disk cache).
 *
 * Background: the MFM JSONs surface paid wargear as a flat list of
 * `{ name, points }` per datasheet but carry no per-option caps. BSData
 * encodes those caps as <constraint> elements on the wargear's
 * selectionEntry/entryLink and on its ancestor groups; this scraper
 * resolves the chain into a single `maxPerUnit` per option name.
 *
 * Same tag-pin strategy as the keyword/enhancement scrapers: resolve
 * BSData's `main` to a commit SHA at scrape time, cache by SHA. Reuses
 * fetch/cache and the faction mapping from the sibling keyword scraper.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchCatFile } from "../scrape-bsdata-keywords/fetch.mjs";
import { normalizeApostrophes } from "../../src/utils/apostrophe-normalization.js";
import {
  parseCatRaw,
  buildTargetIndex,
  iterUnits,
  extractWargearCaps,
  normalizeName,
} from "./extract-wargear.mjs";
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
  "wargear-restrictions.bsdata.auto.json"
);

async function main() {
  const refresh = process.argv.includes("--refresh");
  const mapping = JSON.parse(await readFile(MAPPING_PATH, "utf8"));

  const factions = Object.keys(mapping).filter((k) => !k.startsWith("_"));
  const filesNeeded = new Set();
  for (const f of factions) for (const file of mapping[f]) filesNeeded.add(file);

  const { sha, committedAt } = await resolveRef(BSDATA_REPO, BSDATA_REF);
  console.log(
    `BSData wargear scrape — ref ${BSDATA_REF} @ ${sha.slice(0, 8)} ` +
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

  // The id→entry index spans every .cat we touched. <entryLink targetId=...>
  // often points at a shared selectionEntry living in a sibling library
  // file (e.g. a SM weapon referenced from a chapter-specific cat), so the
  // index has to be global, not per-file.
  const targetIndex = buildTargetIndex(rootsByFile);
  console.log(`Indexed ${targetIndex.size} ids across all catalogues.`);

  // MFM is the source of truth for "which datasheet has which paid
  // wargear options." We only emit caps for options that actually exist
  // in the MFM JSON, so the output is automatically pruned to the codex-
  // visible surface and any name drift between BSData ("Macro Plasma
  // Incinerator") and MFM ("Macro plasma incinerator") is reconciled to
  // the MFM spelling.
  const mfmWargearByFaction = await loadMfmWargearOptions();

  const restrictionsByFaction = {};
  const stats = {
    factionsConsidered: 0,
    factionsWithOutput: 0,
    datasheetsScanned: 0,
    optionsTotal: 0,
    optionsCapped: 0,
  };

  for (const factionName of factions) {
    stats.factionsConsidered++;
    const factionFiles = mapping[factionName];
    // MFM faction names use curly apostrophes (U+2019), the mapping file
    // uses ASCII (U+0027). Normalize both sides to match. The output JSON
    // is keyed by the normalized form so the runtime can look up using
    // the MFM-shape factionName it already has in hand.
    const factionKey = normalizeApostrophes(factionName);
    const mfmByDatasheet = mfmWargearByFaction.get(factionKey);
    if (!mfmByDatasheet || mfmByDatasheet.size === 0) {
      console.log(
        `  ${factionName.padEnd(22)} 0 datasheet(s) with paid wargear`
      );
      continue;
    }
    const byDatasheet = {};
    for (const [datasheetName, options] of mfmByDatasheet.entries()) {
      stats.datasheetsScanned++;
      stats.optionsTotal += options.length;
      const wargearNames = new Set();
      const wargearOriginal = new Map();
      for (const opt of options) {
        const norm = normalizeName(opt.name);
        if (!norm) continue;
        wargearNames.add(norm);
        wargearOriginal.set(norm, opt.name);
      }
      const datasheetNorm = normalizeName(datasheetName);

      const capsForDatasheet = {};
      for (const file of factionFiles) {
        const root = rootsByFile[file];
        if (!root) continue;
        for (const unit of iterUnits(root)) {
          const unitName = normalizeName(unit["@_name"]);
          if (unitName !== datasheetNorm) continue;
          const caps = extractWargearCaps(unit, {
            wargearNames,
            wargearOriginal,
            targetIndex,
          });
          for (const [optName, cap] of Object.entries(caps)) {
            const prev = capsForDatasheet[optName];
            if (prev === undefined || cap < prev) {
              capsForDatasheet[optName] = cap;
            }
          }
        }
      }
      if (Object.keys(capsForDatasheet).length > 0) {
        byDatasheet[datasheetName] = sortObjectByKey(
          Object.fromEntries(
            Object.entries(capsForDatasheet).map(([name, maxPerUnit]) => [
              name,
              { maxPerUnit },
            ])
          )
        );
        stats.optionsCapped += Object.keys(capsForDatasheet).length;
      }
    }
    if (Object.keys(byDatasheet).length > 0) {
      restrictionsByFaction[factionKey] = sortObjectByKey(byDatasheet);
      stats.factionsWithOutput++;
    }
    const sheetCount = Object.keys(byDatasheet).length;
    const optCount = Object.values(byDatasheet).reduce(
      (n, opts) => n + Object.keys(opts).length,
      0
    );
    console.log(
      `  ${factionName.padEnd(22)} ${sheetCount} datasheet(s), ${optCount} option(s) capped`
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
    _generator: "scripts/scrape-bsdata-wargear",
    ...sortedFactions,
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log(
    `\nWrote ${stats.optionsCapped}/${stats.optionsTotal} option(s) across ` +
      `${stats.factionsWithOutput}/${stats.factionsConsidered} faction(s) → ` +
      `src/data/configs/wargear-restrictions.bsdata.auto.json`
  );
}

// Mirror loadMfmEnhancementNames in scrape-bsdata-enhancements: read the
// resolved MFM snapshot overlay off disk so we don't depend on the Vite-
// only runtime aggregator. Returns
//   Map<factionName, Map<datasheetName, wargearOptions[]>>
// keyed verbatim from the MFM JSON.
async function loadMfmWargearOptions() {
  const mfmRoot = resolve(REPO_ROOT, "src", "data", "munitorum-field-manual-11th");
  const resolved = await resolveSnapshotState(mfmRoot);
  if (!resolved) throw new Error("No MFM snapshot dirs found");
  const out = new Map();
  for (const payload of Object.values(resolved.factions)) {
    const factionName = payload.faction;
    if (!factionName) continue;
    const byDatasheet = new Map();
    for (const d of payload.datasheets ?? []) {
      if (!d.wargearOptions?.length) continue;
      byDatasheet.set(d.name, d.wargearOptions);
    }
    if (byDatasheet.size) out.set(factionName, byDatasheet);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
