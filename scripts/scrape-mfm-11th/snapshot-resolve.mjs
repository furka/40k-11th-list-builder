// Shared helper for walking the MFM snapshot history. Snapshots are stored
// as `v<siteVersion>-<scrapedAt>/` directories under
// `src/data/munitorum-field-manual-11th/`. Older snapshots are dense (every
// faction JSON present); newer snapshots are sparse (only the faction JSONs
// whose payload changed since the previous snapshot). To get the full faction
// set as of any snapshot, walk all snapshots up to that point in chronological
// order and layer each one's faction files on top of the running map.
//
// The runtime aggregator at src/data/munitorum-field-manual-11th/index.js does
// the same overlay via Vite's `import.meta.glob`. This module is the Node-fs
// equivalent for scripts that read snapshots off disk.

import { readdir, readFile } from "node:fs/promises";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const VERSION_DIR_RE = /^v/;

export async function listSnapshotDirs(mfmRoot) {
  if (!existsSync(mfmRoot)) return [];
  const entries = await readdir(mfmRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && VERSION_DIR_RE.test(e.name))
    .map((e) => e.name)
    .sort(); // YYYY-MM-DD suffix → alphabetical = chronological
}

export function listSnapshotDirsSync(mfmRoot) {
  if (!existsSync(mfmRoot)) return [];
  return readdirSync(mfmRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && VERSION_DIR_RE.test(e.name))
    .map((e) => e.name)
    .sort();
}

export async function readSnapshotDir(mfmRoot, dirName) {
  const dirPath = join(mfmRoot, dirName);
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

export function readSnapshotDirSync(mfmRoot, dirName) {
  const dirPath = join(mfmRoot, dirName);
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

// Overlay every snapshot up to and including `upTo` (defaults to the latest).
// Returns the resolved `{ manifest, factions }` — `manifest` is the upTo
// snapshot's manifest, `factions` is the union of every faction file seen,
// with later snapshots winning over earlier ones.
//
// If no snapshots exist, returns `null`.
export async function resolveSnapshotState(mfmRoot, { upTo } = {}) {
  const dirs = await listSnapshotDirs(mfmRoot);
  if (dirs.length === 0) return null;
  const stopAt = upTo ?? dirs[dirs.length - 1];
  const stopIdx = dirs.indexOf(stopAt);
  if (stopIdx < 0) {
    throw new Error(`Snapshot dir "${stopAt}" not found under ${mfmRoot}`);
  }
  const factions = {};
  let manifest = null;
  for (let i = 0; i <= stopIdx; i++) {
    const snap = await readSnapshotDir(mfmRoot, dirs[i]);
    if (!snap) continue;
    Object.assign(factions, snap.factions);
    manifest = snap.manifest;
  }
  return { manifest, factions };
}

export function resolveSnapshotStateSync(mfmRoot, { upTo } = {}) {
  const dirs = listSnapshotDirsSync(mfmRoot);
  if (dirs.length === 0) return null;
  const stopAt = upTo ?? dirs[dirs.length - 1];
  const stopIdx = dirs.indexOf(stopAt);
  if (stopIdx < 0) {
    throw new Error(`Snapshot dir "${stopAt}" not found under ${mfmRoot}`);
  }
  const factions = {};
  let manifest = null;
  for (let i = 0; i <= stopIdx; i++) {
    const snap = readSnapshotDirSync(mfmRoot, dirs[i]);
    if (!snap) continue;
    Object.assign(factions, snap.factions);
    manifest = snap.manifest;
  }
  return { manifest, factions };
}
