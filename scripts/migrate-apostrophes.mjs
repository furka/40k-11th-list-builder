#!/usr/bin/env node
// One-shot migration: walk every JSON data file under src/data/ and rewrite
// it with apostrophe-canonicalized strings (U+0027 / U+2018 / U+02BC / U+02BB
// → U+2019). Idempotent — a second run produces no changes. The scrapers
// (mfm, bsdata-keywords, bsdata-enhancements, llm-classify) now apply the
// same normalization at write time, so this script is only needed once to
// bring the existing committed data into line.
//
// Run with: `node scripts/migrate-apostrophes.mjs`

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeApostrophesDeep } from "../src/utils/apostrophe-normalization.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const TARGETS = [
  "src/data/configs/enhancement-restrictions.auto.json",
  "src/data/configs/enhancement-restrictions.bsdata.auto.json",
  "src/data/configs/enhancement-restrictions.manual.json",
  "src/data/configs/conditional-battleline.auto.json",
  "src/data/keywords/bsdata-keywords.auto.json",
  "src/data/keywords/faction-pack-keywords.auto.json",
  "src/data/keywords/manual-overrides.json",
];

// Expand every MFM snapshot's per-faction JSON files into the targets list.
function expandMfmSnapshots() {
  const dir = resolve(REPO_ROOT, "src", "data", "munitorum-field-manual-11th");
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (!/^v/.test(entry)) continue;
    for (const fname of readdirSync(full)) {
      if (!fname.endsWith(".json") || fname.startsWith("_")) continue;
      out.push(join("src", "data", "munitorum-field-manual-11th", entry, fname));
    }
  }
  return out;
}

const allTargets = [...TARGETS, ...expandMfmSnapshots()];

let changed = 0;
let unchanged = 0;
let missing = 0;

for (const rel of allTargets) {
  const full = resolve(REPO_ROOT, rel);
  let original;
  try {
    original = readFileSync(full, "utf8");
  } catch {
    missing++;
    console.log(`  skip (missing): ${rel}`);
    continue;
  }
  const parsed = JSON.parse(original);
  const normalized = normalizeApostrophesDeep(parsed);
  // Match the trailing-newline convention each scraper uses (every emitted
  // file ends with "\n"). JSON.stringify itself doesn't, so add one explicitly.
  const next = JSON.stringify(normalized, null, 2) + "\n";
  if (next === original) {
    unchanged++;
  } else {
    writeFileSync(full, next, "utf8");
    changed++;
    console.log(`  rewrote: ${rel}`);
  }
}

console.log(
  `\nDone — ${changed} file(s) rewrote, ${unchanged} unchanged, ${missing} missing of ${allTargets.length} checked.`
);
