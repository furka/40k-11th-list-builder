import { parse11thSnapshot } from "../../utils/data-reader-11th";

/**
 * Enumerate every 11th-edition snapshot in this directory and produce a
 * version-keyed MFM bucket. The layout is:
 *
 *   current/                    — the live/latest version (dense: every faction)
 *   historical/v<ver>-<date>/   — archived prior versions (dense standalone)
 *
 * Each snapshot is a complete, standalone faction set (a `_manifest.json` plus
 * one JSON per faction) — there is no sparse overlay to reconstruct. `current/`
 * is rewritten in place each scrape so PRs show clean per-faction diffs; the
 * prior `current/` is archived into `historical/` before it is overwritten.
 *
 * Output:
 *   {
 *     "V1.0": { FACTIONS, DATA_SHEETS, MFM_VERSION },
 *     "V1.1": { ... },
 *     CURRENT: <ref to current/>,
 *     PREVIOUS: <ref to newest historical/, or null>
 *   }
 */
export function load11thMFM() {
  const modules = import.meta.glob("./**/*.json", { eager: true });

  const snapshots = {};

  for (const path in modules) {
    const data = modules[path].default ?? modules[path];
    // Path format: ./current/necrons.json or ./historical/v1.0-2026-06-17/necrons.json
    const match = path.match(/^\.\/(current|historical\/[^/]+)\/([^/]+)\.json$/);
    if (!match) continue;
    const [, snapshotKey, fileName] = match;

    if (!snapshots[snapshotKey]) {
      snapshots[snapshotKey] = { manifest: null, factions: {} };
    }

    if (fileName === "_manifest") {
      snapshots[snapshotKey].manifest = data;
    } else {
      snapshots[snapshotKey].factions[fileName] = data;
    }
  }

  const MFM = {};
  let current = null;
  let previous = null;

  // Order historical snapshots chronologically (their dir names embed
  // YYYY-MM-DD, so alphabetical = chronological), then `current` last. Keying
  // by siteVersion means a later same-version snapshot wins its key; `current`
  // being last makes it CURRENT and the newest historical PREVIOUS.
  const historical = Object.keys(snapshots)
    .filter((k) => k !== "current")
    .sort();
  const orderedKeys = snapshots.current
    ? [...historical, "current"]
    : historical;

  for (const snapshotKey of orderedKeys) {
    const snap = snapshots[snapshotKey];
    if (!snap.manifest) {
      console.warn(`11th edition snapshot "${snapshotKey}" is missing _manifest.json. Skipping.`);
      continue;
    }
    const parsed = parse11thSnapshot(snap);
    MFM[parsed.MFM_VERSION] = parsed;
    previous = current;
    current = parsed;
  }

  MFM.CURRENT = current;
  MFM.PREVIOUS = previous;

  return MFM;
}
