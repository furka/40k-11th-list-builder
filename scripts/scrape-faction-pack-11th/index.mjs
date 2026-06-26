// Standalone Faction Pack PDF scraper.
//
// Reads datasheet / detachment / enhancement vocabulary from the committed MFM
// snapshot (src/data/munitorum-field-manual-11th/), fetches the cached Faction
// Pack PDFs, classifies each page by type, and runs the four PDF passes:
//   1. datasheet keywords          → src/data/keywords/faction-pack-keywords.auto.json
//   2. enhancement restrictions    → src/data/configs/enhancement-restrictions.auto.json
//   3. detachment BATTLELINE grants→ src/data/configs/conditional-battleline.auto.json
//   4. Rules-Updates keyword errata→ src/data/keywords/errata-keywords.auto.json
//
// Decoupled from the MFM website scrape (scripts/scrape-mfm-11th/): that job owns
// points + the snapshot; this job owns everything sourced from the PDFs. Run
// after the MFM job so it reads the freshest snapshot.
//
//   node scripts/scrape-faction-pack-11th/index.mjs [--refresh]

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveSnapshotState } from "../scrape-mfm-11th/snapshot-resolve.mjs";
import { createWarningSink } from "../scrape-mfm-11th/warnings.mjs";
import {
  scrapePdfKeywords,
  scrapePdfRestrictions,
  scrapeDetachmentGrants,
} from "./pdf-passes.mjs";
import { scrapeErrataKeywords } from "./scrape-errata-keywords.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MFM_ROOT = resolve(__dirname, "../../src/data/munitorum-field-manual-11th");

async function flushAndReport(warnings) {
  const payload = await warnings.flush();
  const total = payload.warnings.length;
  if (total === 0) {
    console.log("\nNo warnings emitted.");
    return;
  }
  console.log(`\n${total} warning(s):`);
  for (const [category, count] of Object.entries(payload.counts)) {
    console.log(`  ${category}: ${count}`);
  }
}

async function main() {
  const refresh = process.argv.includes("--refresh");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — the PDF passes need it. Aborting.");
    process.exit(1);
  }

  const resolved = await resolveSnapshotState(MFM_ROOT);
  if (!resolved) {
    console.error(`No MFM snapshots under ${MFM_ROOT}. Run the MFM scrape first.`);
    process.exit(1);
  }

  // The snapshot factions object is { slug: { faction, detachments, datasheets } }
  // — the exact payload shape the passes expect from the old in-memory scrape.
  const scraped = new Map(Object.entries(resolved.factions));
  const slugs = [...scraped.keys()];
  console.log(`Faction Pack PDF scrape over ${slugs.length} faction(s) from snapshot.`);

  const warnings = createWarningSink("faction-pack-scrape");

  // A full pass over every faction in the snapshot — rebuild each output from
  // scratch (isFullScrape) so dropped/renamed entries don't linger.
  console.log("\nPDF keyword pass …");
  await scrapePdfKeywords(scraped, slugs, warnings, { refresh, isFullScrape: true });
  console.log("\nEnhancement restrictions pass …");
  await scrapePdfRestrictions(scraped, slugs, warnings, { refresh, isFullScrape: true });
  console.log("\nDetachment-grants pass …");
  await scrapeDetachmentGrants(scraped, slugs, warnings, { refresh, isFullScrape: true });
  console.log("\nRules-Updates keyword errata pass …");
  await scrapeErrataKeywords({ refresh, warnings });

  await flushAndReport(warnings);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
