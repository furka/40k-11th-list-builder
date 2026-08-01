#!/usr/bin/env node
// One-shot migration: convert the legacy sparse MFM snapshot layout
//
//   src/data/munitorum-field-manual-11th/
//     v1.0-2026-06-17/   (dense — initial dump)
//     v1.0-2026-06-23/   (sparse — only changed factions)
//     v1.1-2026-07-30/   (sparse)
//
// into the current/ + historical/ dense layout
//
//   src/data/munitorum-field-manual-11th/
//     current/                    (dense — the latest version)
//     historical/v1.0-2026-06-17/ (dense standalone)
//     historical/v1.0-2026-06-23/ (dense standalone)
//
// Each output dir is a full standalone snapshot (every faction JSON present),
// so the sparse-overlay reconstruction model is retired. The latest legacy
// snapshot becomes `current/`; every earlier snapshot is densified (by
// overlaying all prior snapshots up to it) into `historical/<dir>/`. Each
// snapshot's `_manifest.json` and `_changes.md` are carried across verbatim.
//
// Idempotent-ish: it exits early if no legacy `v*/` dirs remain. Run once:
//   node scripts/migrate-mfm-to-current.mjs

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../src/data/munitorum-field-manual-11th");
const CURRENT_DIR = join(ROOT, "current");
const HISTORICAL_DIR = join(ROOT, "historical");

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

function listLegacyDirs() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^v/.test(e.name))
    .map((e) => e.name)
    .sort(); // YYYY-MM-DD suffix → alphabetical = chronological
}

function readLegacyDir(dirName) {
  const dirPath = join(ROOT, dirName);
  const manifest = JSON.parse(
    readFileSync(join(dirPath, "_manifest.json"), "utf8")
  );
  const factions = {};
  let changesMd = null;
  for (const fname of readdirSync(dirPath)) {
    if (fname === "_changes.md") {
      changesMd = readFileSync(join(dirPath, fname), "utf8");
      continue;
    }
    if (!fname.endsWith(".json") || fname.startsWith("_")) continue;
    const slug = fname.replace(/\.json$/, "");
    factions[slug] = JSON.parse(readFileSync(join(dirPath, fname), "utf8"));
  }
  return { manifest, factions, changesMd };
}

// Overlay every legacy snapshot up to and including `upToIdx` into a full,
// dense faction set (later snapshots win over earlier ones).
function resolveDense(dirs, upToIdx) {
  const factions = {};
  for (let i = 0; i <= upToIdx; i++) {
    Object.assign(factions, readLegacyDir(dirs[i]).factions);
  }
  return factions;
}

function writeDenseSnapshot(destDir, { manifest, factions, changesMd }) {
  mkdirSync(destDir, { recursive: true });
  writeFileSync(join(destDir, "_manifest.json"), stableStringify(manifest), "utf8");
  if (changesMd != null) {
    writeFileSync(join(destDir, "_changes.md"), changesMd, "utf8");
  }
  for (const [slug, payload] of Object.entries(factions)) {
    writeFileSync(join(destDir, `${slug}.json`), stableStringify(payload), "utf8");
  }
}

const dirs = listLegacyDirs();
if (dirs.length === 0) {
  console.log("No legacy v*/ snapshot dirs found — nothing to migrate.");
  process.exit(0);
}

console.log(`Migrating ${dirs.length} legacy snapshot(s): ${dirs.join(", ")}`);

const lastIdx = dirs.length - 1;
for (let i = 0; i < dirs.length; i++) {
  const dirName = dirs[i];
  const { manifest, changesMd } = readLegacyDir(dirName);
  const factions = resolveDense(dirs, i);
  const isLatest = i === lastIdx;
  const destDir = isLatest ? CURRENT_DIR : join(HISTORICAL_DIR, dirName);
  writeDenseSnapshot(destDir, { manifest, factions, changesMd });
  console.log(
    `  ${dirName} → ${isLatest ? "current/" : `historical/${dirName}/`} ` +
      `(${Object.keys(factions).length} factions${changesMd ? ", +_changes.md" : ""})`
  );
}

for (const dirName of dirs) {
  rmSync(join(ROOT, dirName), { recursive: true, force: true });
  console.log(`  removed legacy ${dirName}/`);
}

if (!existsSync(CURRENT_DIR)) {
  console.error("ERROR: current/ was not created.");
  process.exit(1);
}
console.log("Migration complete.");
