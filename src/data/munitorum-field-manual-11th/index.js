import { parse11thSnapshot } from "../../utils/data-reader-11th";

/**
 * Enumerate every 11th-edition snapshot in this directory and produce a
 * version-keyed MFM bucket. Each subdirectory `v<siteVersion>-<scrapedAt>/`
 * is one historical snapshot containing a `_manifest.json` and a JSON file
 * for each faction whose data changed since the prior snapshot. Snapshots
 * are sparse: an older snapshot may carry every faction, a newer one may
 * only carry the factions that actually changed. The resolved faction set
 * for snapshot N is the running overlay of every snapshot up to N.
 *
 * Re-running the scraper either updates files in place (content unchanged
 * since the previous run, no new dir minted) or mints a new sparse
 * subdirectory that this aggregator picks up at build time.
 *
 * Output:
 *   {
 *     "V1.0": { FACTIONS, DATA_SHEETS, MFM_VERSION },
 *     "V1.1": { ... },
 *     CURRENT: <ref to latest snapshot>,
 *     PREVIOUS: <ref to second-latest, or null>
 *   }
 */
export function load11thMFM() {
  const modules = import.meta.glob("./*/*.json", { eager: true });

  const sparseSnapshots = {};

  for (const path in modules) {
    const data = modules[path].default ?? modules[path];
    // Path format: ./v1.0-2026-06-17/necrons.json
    const match = path.match(/^\.\/([^/]+)\/([^/]+)\.json$/);
    if (!match) continue;
    const [, dirName, fileName] = match;

    if (!sparseSnapshots[dirName]) {
      sparseSnapshots[dirName] = { manifest: null, factions: {} };
    }

    if (fileName === "_manifest") {
      sparseSnapshots[dirName].manifest = data;
    } else {
      sparseSnapshots[dirName].factions[fileName] = data;
    }
  }

  const MFM = {};
  let current = null;
  let previous = null;

  // Sort version directories alphabetically — names embed YYYY-MM-DD so this
  // is chronological. Walk in order, layering each snapshot's faction files
  // on top of the running set, then parse the resolved (not sparse) state.
  const sortedDirs = Object.keys(sparseSnapshots).sort();
  const carryFactions = {};

  for (const dirName of sortedDirs) {
    const snap = sparseSnapshots[dirName];
    if (!snap.manifest) {
      console.warn(`11th edition snapshot "${dirName}" is missing _manifest.json. Skipping.`);
      continue;
    }
    Object.assign(carryFactions, snap.factions);
    const resolved = { manifest: snap.manifest, factions: { ...carryFactions } };
    const parsed = parse11thSnapshot(resolved);
    MFM[parsed.MFM_VERSION] = parsed;
    previous = current;
    current = parsed;
  }

  MFM.CURRENT = current;
  MFM.PREVIOUS = previous;

  return MFM;
}
