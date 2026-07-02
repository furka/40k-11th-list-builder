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
//
// Resumable & fail-safe: every LLM response is cached by content hash in
// .cache/, so re-running costs ZERO tokens for already-classified entries — a
// run interrupted by exhausted API credits just resumes where it left off. A
// fatal API error (credits/auth) aborts the whole run and rolls the four output
// files back to their committed state (all-or-nothing): the data is never left
// half-updated or wiped. Force a full re-classify by deleting .cache/ or bumping
// a `makeCacheKey` version prefix in a classifier.

import { readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
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
import { fetchFactionPackPdf } from "./fetch.mjs";
import {
  classifierRevision,
  computeFactionTextHash,
  isUnchanged,
  loadFingerprints,
  saveFingerprints,
} from "./fingerprints.mjs";
import { AbortScrapeError } from "./api-errors.mjs";
import { flushLlmCache } from "./llm-classify.mjs";
import { flushKeywordCache } from "./llm-classify-keywords.mjs";
import { flushDetachmentGrantsCache } from "./llm-classify-detachment-grants.mjs";
import { flushErrataKeywordCache } from "./llm-classify-errata-keywords.mjs";

// Best-effort durable flush of every content-hash cache. The passes flush their
// own cache in a finally, but a hard signal (Ctrl-C) or an unhandled rejection
// can bypass those — register process handlers so completed classifications are
// never lost, keeping the next run a cheap resume.
async function flushAllCaches() {
  await Promise.allSettled([
    flushLlmCache(),
    flushKeywordCache(),
    flushDetachmentGrantsCache(),
    flushErrataKeywordCache(),
  ]);
}

let flushing = false;
function installCacheFlushGuards() {
  const onSignal = async (signal) => {
    if (flushing) return;
    flushing = true;
    console.error(`\nReceived ${signal} — flushing scraper caches before exit…`);
    await flushAllCaches();
    process.exit(130);
  };
  process.once("SIGINT", () => onSignal("SIGINT"));
  process.once("SIGTERM", () => onSignal("SIGTERM"));
  process.once("unhandledRejection", async (reason) => {
    console.error("Unhandled rejection — flushing scraper caches before exit…", reason);
    await flushAllCaches();
    process.exit(1);
  });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const MFM_ROOT = resolve(__dirname, "../../src/data/munitorum-field-manual-11th");
const FACTION_PACK_URLS_PATH = resolve(__dirname, "faction-pack-urls.json");

// Fetch + hash every faction's PDF text up front (parse only, no LLM/tokens) and
// diff it against the committed fingerprint manifest. Returns the set of slugs
// safe to skip and the fresh hashes to record after a successful run. In refresh
// mode nothing is skipped, but hashes are still computed so the manifest is
// rewritten from the freshly-downloaded PDFs.
async function computeFingerprintGate(slugs, warnings, { refresh }) {
  let factionPackUrls = {};
  if (existsSync(FACTION_PACK_URLS_PATH)) {
    factionPackUrls = JSON.parse(await readFile(FACTION_PACK_URLS_PATH, "utf8"));
  }
  const manifest = await loadFingerprints();
  const rev = classifierRevision();
  const skipSlugs = new Set();
  const freshHashes = new Map();
  for (const slug of slugs) {
    const url = factionPackUrls[slug];
    if (!url) continue; // no URL → let the pass handle it (treated as changed)
    let hash;
    try {
      const pdf = await fetchFactionPackPdf(slug, url, { refresh });
      hash = await computeFactionTextHash(pdf);
    } catch (e) {
      // Can't fingerprint (fetch/parse failed) → don't skip; the pass runs and
      // uses its own retain-prior handling. Its hash stays unrecorded so it is
      // retried next run.
      warnings.add("fingerprint-failed", { slug, message: e.message });
      continue;
    }
    freshHashes.set(slug, hash);
    if (!refresh && isUnchanged(manifest[slug], hash, rev)) skipSlugs.add(slug);
  }
  return { manifest, rev, skipSlugs, freshHashes };
}

// Every file the passes write. We snapshot these before the run and restore them
// on a fatal abort so an incomplete run is a true no-op: either the whole scrape
// completes and all four update together, or nothing changes. (The content-hash
// cache still persists, so the next run resumes cheaply.)
const OUTPUT_FILES = [
  resolve(__dirname, "../../src/data/keywords/faction-pack-keywords.auto.json"),
  resolve(__dirname, "../../src/data/configs/enhancement-restrictions.auto.json"),
  resolve(__dirname, "../../src/data/configs/conditional-battleline.auto.json"),
  resolve(__dirname, "../../src/data/keywords/errata-keywords.auto.json"),
];

async function snapshotOutputs() {
  const snap = new Map();
  for (const f of OUTPUT_FILES) {
    snap.set(f, existsSync(f) ? await readFile(f) : null);
  }
  return snap;
}

async function restoreOutputs(snap) {
  for (const [f, content] of snap) {
    if (content === null) {
      if (existsSync(f)) await unlink(f);
    } else {
      await writeFile(f, content);
    }
  }
}

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

  installCacheFlushGuards();

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

  const { manifest, rev, skipSlugs, freshHashes } = await computeFingerprintGate(
    slugs,
    warnings,
    { refresh }
  );
  console.log(
    `Fingerprint gate: ${skipSlugs.size}/${slugs.length} faction(s) unchanged → skipping classification; ` +
      `${slugs.length - skipSlugs.size} to classify.`
  );

  // All-or-nothing: if ANY pass throws (a fatal credit/auth abort, or an
  // unexpected error mid-run), roll the output files back so a partial run never
  // leaves the committed data half-updated. Either the whole scrape completes
  // and all four files update together, or nothing changes.
  const snapshot = await snapshotOutputs();
  try {
    // A full pass over every faction in the snapshot — rebuild each output from
    // scratch (isFullScrape) so dropped/renamed entries don't linger. Skipped
    // (fingerprint-unchanged) factions retain their prior committed data.
    console.log("\nPDF keyword pass …");
    await scrapePdfKeywords(scraped, slugs, warnings, { refresh, isFullScrape: true, skipSlugs });
    console.log("\nEnhancement restrictions pass …");
    await scrapePdfRestrictions(scraped, slugs, warnings, { refresh, isFullScrape: true, skipSlugs });
    console.log("\nDetachment-grants pass …");
    await scrapeDetachmentGrants(scraped, slugs, warnings, { refresh, isFullScrape: true, skipSlugs });
    console.log("\nRules-Updates keyword errata pass …");
    await scrapeErrataKeywords({ refresh, warnings, skipSlugs });
  } catch (e) {
    await restoreOutputs(snapshot);
    console.error(
      e instanceof AbortScrapeError
        ? "Rolled back all output files — committed data is unchanged."
        : "Scrape failed mid-run — rolled back all output files; committed data is unchanged."
    );
    throw e;
  }

  // The scrape completed (no rollback). Record fresh fingerprints for every
  // classified faction. A gate hash implies the PDF fetched + parsed cleanly, so
  // the passes' per-faction fetch/parse succeeded too — the committed output
  // reflects this text. Skipped factions keep their existing (matching) entry.
  for (const slug of slugs) {
    if (skipSlugs.has(slug)) continue;
    const hash = freshHashes.get(slug);
    if (hash) manifest[slug] = { textHash: hash, rev };
  }
  await saveFingerprints(manifest);

  await flushAndReport(warnings);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    if (e instanceof AbortScrapeError) {
      // Fatal API error (credits/auth). The passes flushed their caches in
      // their finally blocks and did NOT overwrite any output, so committed
      // data is byte-identical and the next run resumes from the cache.
      console.error(`\n${e.message}`);
      console.error(
        "Run aborted before completion — no data files were modified. " +
          "Top up API credits / fix the key and re-run; completed " +
          "classifications are cached and will not be re-charged."
      );
      process.exit(1);
    }
    console.error(e);
    process.exit(1);
  });
}
