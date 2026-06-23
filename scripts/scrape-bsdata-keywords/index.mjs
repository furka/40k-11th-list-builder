#!/usr/bin/env node
/**
 * Scrape per-datasheet keywords from BSData/wh40k-10e and emit an overlay
 * JSON the app merges on top of its MFM-sourced datasheets at parse time.
 *
 * Run: `npm run bsdata:scrape` (or `:refresh` to bypass the on-disk cache).
 *
 * Tracks BSData's `main` branch — tagged releases stopped at v10.6.0 in
 * March 2025 but main is the actively-maintained source (NewRecruit and the
 * BSData/AppSpot ecosystem are also stuck on v10.6.0 by extension). At
 * scrape time we resolve `main` to its current commit SHA via the GitHub
 * API and use that SHA for cache + URL keying, so each run is reproducible
 * and the cache invalidates naturally on every upstream merge.
 *
 * 10e keywords carry over to 11e unchanged for everything except BATTLELINE
 * (handled separately via conditional-battleline.auto.json + the user's
 * bonusBattleline overrides). Anything missing from BSData stays uncovered
 * until either BSData picks it up or a hand entry lands in
 * `src/data/keywords/manual-overrides.json`.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCatFile } from "./fetch.mjs";
import { parseCatFile } from "./parse-cat.mjs";
import { buildKeywordsByFaction } from "./build-index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// The upstream branch we track. Resolved to a commit SHA at scrape time.
const BSDATA_REF = "main";
const BSDATA_REPO = "BSData/wh40k-10e";

const OUTPUT_PATH = resolve(
  REPO_ROOT,
  "src",
  "data",
  "keywords",
  "bsdata-keywords.auto.json"
);

async function main() {
  const refresh = process.argv.includes("--refresh");
  const mappingPath = resolve(__dirname, "faction-mapping.json");
  const mapping = JSON.parse(await readFile(mappingPath, "utf8"));

  const factions = Object.keys(mapping).filter((k) => !k.startsWith("_"));
  const filesNeeded = new Set();
  for (const f of factions) for (const file of mapping[f]) filesNeeded.add(file);

  const { sha, committedAt } = await resolveRef(BSDATA_REPO, BSDATA_REF);
  console.log(
    `BSData scrape — ref ${BSDATA_REF} @ ${sha.slice(0, 8)} (${committedAt}), ` +
      `${factions.length} factions, ${filesNeeded.size} unique .cat files` +
      `${refresh ? " (cache bypass)" : ""}`
  );

  const parsedByFile = {};
  const missingFiles = [];
  for (const file of filesNeeded) {
    const xml = await fetchCatFile(sha, file, { refresh });
    if (xml === null) {
      missingFiles.push(file);
      parsedByFile[file] = [];
      process.stdout.write("x");
    } else {
      parsedByFile[file] = parseCatFile(xml);
      process.stdout.write(".");
    }
  }
  process.stdout.write("\n");
  if (missingFiles.length > 0) {
    console.warn(
      `\n${missingFiles.length} file(s) absent at ${BSDATA_TAG} (added to ` +
        `BSData's main branch after the tag was cut — will populate on tag bump):`
    );
    for (const f of missingFiles) console.warn(`  - ${f}`);
  }

  const keywordsByFaction = buildKeywordsByFaction(parsedByFile, mapping);

  await ensureDir(dirname(OUTPUT_PATH));
  const header = {
    _source: `https://github.com/${BSDATA_REPO}`,
    _ref: BSDATA_REF,
    _sha: sha,
    _committedAt: committedAt,
    _generatedAt: new Date().toISOString(),
    _generator: "scripts/scrape-bsdata-keywords",
  };
  const payload = { ...header, ...keywordsByFaction };
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");

  let totalDatasheets = 0;
  for (const f of factions) {
    const count = Object.keys(keywordsByFaction[f] ?? {}).length;
    totalDatasheets += count;
    if (count === 0) console.warn(`  ⚠ ${f}: 0 datasheets — mapping miss?`);
    else console.log(`  ${f.padEnd(22)} ${count} datasheets`);
  }
  console.log(
    `Wrote ${totalDatasheets} datasheets across ${factions.length} factions → ` +
      `src/data/keywords/bsdata-keywords.auto.json`
  );

  await reportUnmatchedDatasheets(keywordsByFaction);
}

async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

// Resolve a branch name to its current commit SHA + commit date via GitHub's
// API. We hit the commits endpoint (not refs) so we also pick up the
// authored/committed timestamp for the output header in one round-trip.
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
  return {
    sha: json.sha,
    committedAt: json.commit?.committer?.date ?? null,
  };
}

// Diff BSData coverage against the current MFM snapshot — anything in MFM that
// BSData doesn't carry will land in `manual-overrides.json` (or be left
// keyword-less). Warnings only, never fail the run.
async function reportUnmatchedDatasheets(keywordsByFaction) {
  const aggregatorPath = resolve(
    REPO_ROOT,
    "src",
    "data",
    "munitorum-field-manual-11th",
    "index.js"
  );
  if (!existsSync(aggregatorPath)) return;

  const url = new URL(`file://${aggregatorPath}`);
  let MFM;
  try {
    ({ MFM } = await import(url.href));
  } catch (err) {
    console.warn("Could not import MFM for coverage diff:", err.message);
    return;
  }
  const current = MFM?.CURRENT;
  if (!current) return;

  const missing = [];
  for (const factionEntry of current.FACTIONS ?? []) {
    const factionName = factionEntry.name;
    const covered = new Set(Object.keys(keywordsByFaction[factionName] ?? {}));
    for (const sheet of current.DATA_SHEETS ?? []) {
      if (sheet.faction !== factionName) continue;
      if (sheet.enhancements) continue;
      if (!covered.has(sheet.name)) {
        missing.push(`${factionName}: ${sheet.name}`);
      }
    }
  }
  if (missing.length === 0) {
    console.log("All MFM datasheets covered by BSData ✓");
  } else {
    console.warn(
      `\n${missing.length} MFM datasheets missing from BSData ` +
        `(may need a manual override):`
    );
    for (const line of missing.slice(0, 40)) console.warn(`  - ${line}`);
    if (missing.length > 40) console.warn(`  … and ${missing.length - 40} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
