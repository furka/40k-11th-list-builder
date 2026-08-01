// Shared helper for reading the MFM snapshot history off disk. Snapshots live
// under `src/data/munitorum-field-manual-11th/`:
//
//   current/                    — the live/latest version (dense: every faction)
//   historical/v<ver>-<date>/   — archived prior versions (dense standalone)
//
// Each snapshot is a complete, standalone faction set — there is no sparse
// overlay to reconstruct. `current/` is rewritten in place each scrape so PRs
// show clean per-faction diffs; the prior `current/` is copied into
// `historical/` before it is overwritten (see index.mjs).
//
// The runtime aggregator at src/data/munitorum-field-manual-11th/index.js reads
// the same layout via Vite's `import.meta.glob`. This module is the Node-fs
// equivalent for scripts that read snapshots off disk.
//
// Snapshots are addressed by a logical name: "current", or a historical dir
// name like "v1.0-2026-06-23". `listSnapshotDirs` returns them in chronological
// order (historical oldest→newest, then "current" last), preserving the
// "last entry is the latest" contract callers rely on.

import { readdir, readFile } from "node:fs/promises";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const CURRENT_NAME = "current";
const HISTORICAL_SUBDIR = "historical";
const VERSION_DIR_RE = /^v/;

function snapshotPath(mfmRoot, name) {
  return name === CURRENT_NAME
    ? join(mfmRoot, CURRENT_NAME)
    : join(mfmRoot, HISTORICAL_SUBDIR, name);
}

export async function listSnapshotDirs(mfmRoot) {
  const historicalRoot = join(mfmRoot, HISTORICAL_SUBDIR);
  const historical = existsSync(historicalRoot)
    ? (await readdir(historicalRoot, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && VERSION_DIR_RE.test(e.name))
        .map((e) => e.name)
        .sort() // YYYY-MM-DD suffix → alphabetical = chronological
    : [];
  return existsSync(join(mfmRoot, CURRENT_NAME))
    ? [...historical, CURRENT_NAME]
    : historical;
}

export function listSnapshotDirsSync(mfmRoot) {
  const historicalRoot = join(mfmRoot, HISTORICAL_SUBDIR);
  const historical = existsSync(historicalRoot)
    ? readdirSync(historicalRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory() && VERSION_DIR_RE.test(e.name))
        .map((e) => e.name)
        .sort()
    : [];
  return existsSync(join(mfmRoot, CURRENT_NAME))
    ? [...historical, CURRENT_NAME]
    : historical;
}

export async function readSnapshotDir(mfmRoot, name) {
  const dirPath = snapshotPath(mfmRoot, name);
  const manifestPath = join(dirPath, "_manifest.json");
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const factions = {};
  for (const fname of await readdir(dirPath)) {
    if (!fname.endsWith(".json") || fname.startsWith("_")) continue;
    const slug = fname.replace(/\.json$/, "");
    factions[slug] = JSON.parse(await readFile(join(dirPath, fname), "utf8"));
  }
  return { manifest, factions };
}

export function readSnapshotDirSync(mfmRoot, name) {
  const dirPath = snapshotPath(mfmRoot, name);
  const manifestPath = join(dirPath, "_manifest.json");
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const factions = {};
  for (const fname of readdirSync(dirPath)) {
    if (!fname.endsWith(".json") || fname.startsWith("_")) continue;
    const slug = fname.replace(/\.json$/, "");
    factions[slug] = JSON.parse(readFileSync(join(dirPath, fname), "utf8"));
  }
  return { manifest, factions };
}

// Read one snapshot's full state. `upTo` selects the snapshot by logical name
// (defaults to "current", the latest). Each snapshot is dense/standalone, so no
// overlay is needed. Returns `{ manifest, factions }`, or `null` if the target
// snapshot doesn't exist.
export async function resolveSnapshotState(mfmRoot, { upTo } = {}) {
  return readSnapshotDir(mfmRoot, upTo ?? CURRENT_NAME);
}

export function resolveSnapshotStateSync(mfmRoot, { upTo } = {}) {
  return readSnapshotDirSync(mfmRoot, upTo ?? CURRENT_NAME);
}
