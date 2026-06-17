import { parse11thSnapshot } from "../../utils/data-reader-11th";

/**
 * Enumerate every 11th-edition snapshot in this directory and produce a
 * version-keyed MFM bucket. Each subdirectory `v<siteVersion>-<scrapedAt>/`
 * is one historical snapshot containing a `_manifest.json` and one JSON file
 * per faction. Adding a new snapshot is zero-config — re-running the scraper
 * either updates files in place (content unchanged) or mints a new
 * subdirectory that this aggregator will automatically pick up at build time.
 *
 * Output:
 *   {
 *     "V1.0 (2026-06-17)": { FACTIONS, DATA_SHEETS, MFM_VERSION, EDITION },
 *     "V1.1 (2026-07-15)": { ... },
 *     CURRENT: <ref to latest snapshot>,
 *     PREVIOUS: <ref to second-latest, or null>
 *   }
 */
export function load11thMFM() {
  const modules = import.meta.glob("./*/*.json", { eager: true });

  const snapshots = {};

  for (const path in modules) {
    const data = modules[path].default ?? modules[path];
    // Path format: ./v1.0-2026-06-17/necrons.json
    const match = path.match(/^\.\/([^/]+)\/([^/]+)\.json$/);
    if (!match) continue;
    const [, dirName, fileName] = match;

    if (!snapshots[dirName]) {
      snapshots[dirName] = { manifest: null, factions: {} };
    }

    if (fileName === "_manifest") {
      snapshots[dirName].manifest = data;
    } else {
      snapshots[dirName].factions[fileName] = data;
    }
  }

  const MFM = {};
  let current = null;
  let previous = null;

  // Sort version directories alphabetically — names embed YYYY-MM-DD so this
  // is chronological. Iterate in order to find CURRENT and PREVIOUS.
  const sortedDirs = Object.keys(snapshots).sort();

  for (const dirName of sortedDirs) {
    const snap = snapshots[dirName];
    if (!snap.manifest) {
      console.warn(`11th edition snapshot "${dirName}" is missing _manifest.json. Skipping.`);
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
