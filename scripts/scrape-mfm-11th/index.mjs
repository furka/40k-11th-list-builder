import { writeFile, mkdir, readdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { FACTION_SLUGS } from "./factions.mjs";
import { fetchFactionHtml } from "./fetch.mjs";
import { extractFactionData } from "./extract.mjs";
import { normalizeFactionData } from "./normalize.mjs";
import { createWarningSink } from "./warnings.mjs";
import { resolveSnapshotState } from "./snapshot-resolve.mjs";
import { diffSnapshots } from "./diff-snapshot.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = resolve(__dirname, "../../src/data/munitorum-field-manual-11th");
const CURRENT_DIR = join(OUT_ROOT, "current");
const HISTORICAL_DIR = join(OUT_ROOT, "historical");

const FACTION_NAMES = {
  "adepta-sororitas": "ADEPTA SORORITAS",
  "adeptus-custodes": "ADEPTUS CUSTODES",
  "adeptus-mechanicus": "ADEPTUS MECHANICUS",
  "aeldari": "AELDARI",
  "astra-militarum": "ASTRA MILITARUM",
  "black-templars": "BLACK TEMPLARS",
  "blood-angels": "BLOOD ANGELS",
  "chaos-daemons": "CHAOS DAEMONS",
  "chaos-knights": "CHAOS KNIGHTS",
  "chaos-space-marines": "CHAOS SPACE MARINES",
  "dark-angels": "DARK ANGELS",
  "death-guard": "DEATH GUARD",
  "deathwatch": "DEATHWATCH",
  "drukhari": "DRUKHARI",
  "emperors-children": "EMPEROR'S CHILDREN",
  "genestealer-cults": "GENESTEALER CULTS",
  "grey-knights": "GREY KNIGHTS",
  "imperial-agents": "IMPERIAL AGENTS",
  "imperial-knights": "IMPERIAL KNIGHTS",
  "leagues-of-votann": "LEAGUES OF VOTANN",
  "necrons": "NECRONS",
  "orks": "ORKS",
  "space-marines": "SPACE MARINES",
  "space-wolves": "SPACE WOLVES",
  "tau-empire": "T'AU EMPIRE",
  "thousand-sons": "THOUSAND SONS",
  "tyranids": "TYRANIDS",
  "world-eaters": "WORLD EATERS",
};

async function ensureDir(path) {
  if (!existsSync(path)) await mkdir(path, { recursive: true });
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

async function scrapeOne(slug, { refresh, warnings }) {
  // Fetch twice: the default page (Legends hidden) and the same page with
  // `isLegendsDisplayed=true` cookie (Legends included). Diff the datasheet
  // name sets — any sheet that only appears in the legends-on fetch is
  // tagged `legends: true` in the output. The legends-on payload is a
  // superset of the control, so normalising IT gives us the complete unit
  // list; the diff just classifies them.
  const controlHtml = await fetchFactionHtml(slug, { refresh, legends: false });
  const legendsHtml = await fetchFactionHtml(slug, { refresh, legends: true });
  const controlRaw = extractFactionData(controlHtml);
  const legendsRaw = extractFactionData(legendsHtml);

  // The legends payload is a superset of the control, so it captures any card
  // the extractor failed to name in either fetch. An entry here means a
  // datasheet was dropped — almost certainly because GW restyled its header.
  for (const header of legendsRaw.unrecognizedCards) {
    warnings.add("datasheet-unrecognized-header", { slug, header });
  }

  const controlNames = new Set(controlRaw.datasheets.map((d) => d.name));
  const legendsOnly = new Set(
    legendsRaw.datasheets
      .filter((d) => !controlNames.has(d.name))
      .map((d) => d.name)
  );

  const normalized = normalizeFactionData(
    slug,
    FACTION_NAMES[slug] ?? slug,
    legendsRaw
  );
  for (const sheet of normalized.datasheets) {
    if (legendsOnly.has(sheet.name)) sheet.legends = true;
  }
  return normalized;
}

function payloadsEqualToResolved(priorResolved, scraped) {
  if (!priorResolved) return false;
  const priorKeys = Object.keys(priorResolved.factions).sort();
  const scrapedKeys = [...scraped.keys()].sort();
  if (priorKeys.length !== scrapedKeys.length) return false;
  for (let i = 0; i < priorKeys.length; i++) {
    if (priorKeys[i] !== scrapedKeys[i]) return false;
    if (
      stableStringify(priorResolved.factions[priorKeys[i]]) !==
      stableStringify(scraped.get(scrapedKeys[i]))
    ) {
      return false;
    }
  }
  return true;
}

// Archive the existing current/ into historical/, then overwrite current/ in
// place with the newly scraped dense state. Writing current/ in place (same
// file paths, all factions) is what gives PRs clean per-faction point diffs;
// the prior version is preserved verbatim as a standalone dense copy under
// historical/<v-date>/. Copy (not move) so current/ files remain and register
// as in-place modifications rather than delete+add churn.
async function archiveAndWriteCurrent({
  siteVersion,
  scrapedAt,
  scraped,
  priorResolved,
}) {
  let priorDirName = null;
  if (priorResolved) {
    const prev = priorResolved.manifest;
    priorDirName = `${prev.siteVersion.toLowerCase()}-${prev.scrapedAt}`;
    await ensureDir(HISTORICAL_DIR);
    await cp(CURRENT_DIR, join(HISTORICAL_DIR, priorDirName), { recursive: true });
  }

  await ensureDir(CURRENT_DIR);

  const scrapedSlugs = new Set();
  for (const [slug, payload] of scraped) {
    await writeFile(
      join(CURRENT_DIR, `${slug}.json`),
      stableStringify(payload),
      "utf8"
    );
    scrapedSlugs.add(slug);
  }
  // Prune faction files that no longer exist (a datasheet-set change), so
  // current/ stays a faithful dense snapshot of exactly what was scraped.
  for (const fname of await readdir(CURRENT_DIR)) {
    if (!fname.endsWith(".json") || fname.startsWith("_")) continue;
    if (!scrapedSlugs.has(fname.replace(/\.json$/, ""))) {
      await rm(join(CURRENT_DIR, fname));
    }
  }

  const manifest = { siteVersion, scrapedAt };
  await writeFile(
    join(CURRENT_DIR, "_manifest.json"),
    stableStringify(manifest),
    "utf8"
  );

  const priorMap = new Map(Object.entries(priorResolved?.factions ?? {}));
  const changesMd = diffSnapshots(priorMap, new Map(scraped), {
    siteVersion: siteVersion.toUpperCase(),
    scrapedAt,
    priorDirName,
  });
  await writeFile(join(CURRENT_DIR, "_changes.md"), changesMd + "\n", "utf8");

  return { priorDirName, factionCount: scrapedSlugs.size };
}

// PDF pass: for each MFM enhancement, find its section in the PDF text and
// ask Claude Haiku to classify the restriction (allowedHosts / requiredKeywords
// / nonCharacterOnly / limit / conditional).
//
// MFM-driven (not PDF-driven): we know what enhancements exist from MFM, so
// we search FOR each one in the PDF text rather than discovering entries
// from PDF layout. Layout heuristics are gone entirely — pdfjs flattens the
// PDF to plain text, the LLM reads it as natural language.
//
// Warnings:
//   - mfm-missing-in-pdf: enhancement is in MFM but its name doesn't appear
//     anywhere in the PDF text (codex-only detachments).
//   - llm-call-failed / llm-empty-response: API or schema issues.
//   - classifier-conditional: LLM flagged the host phrase as a trigger
//     ("If your WARLORD has this enhancement…") rather than a constraint.

async function main() {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.split("=")[1].split(",") : null;

  await ensureDir(OUT_ROOT);

  const warnings = createWarningSink("mfm-scrape");

  const slugs = only ? FACTION_SLUGS.filter((s) => only.includes(s)) : FACTION_SLUGS;
  console.log(`Scraping ${slugs.length} faction(s)…`);

  const scraped = new Map();
  const siteVersions = new Set();
  let failCount = 0;

  for (const slug of slugs) {
    try {
      process.stdout.write(`  ${slug} … `);
      const payload = await scrapeOne(slug, { refresh, warnings });
      scraped.set(slug, payload);
      siteVersions.add(payload.siteVersion);
      console.log(
        `ok (${payload.detachments.length} det, ${payload.datasheets.length} sheets)`
      );
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
      failCount++;
    }
  }

  if (scraped.size === 0) {
    console.log("Nothing scraped. Exiting.");
    process.exit(failCount > 0 ? 1 : 0);
  }

  const versionList = [...siteVersions].sort();
  const siteVersion = versionList[versionList.length - 1] ?? "v?";
  if (versionList.length > 1) {
    console.warn(
      `Warning: multiple site versions observed: ${versionList.join(", ")}. Using ${siteVersion}.`
    );
  }

  // A --only run is a partial scrape, so it can't safely decide whether the
  // full dataset changed. Skip the write path entirely for partial scrapes.
  const isFullScrape = !only;

  const priorResolved = await resolveSnapshotState(OUT_ROOT); // reads current/

  if (!isFullScrape) {
    console.log(
      `Partial scrape (--only). Skipping current/ write. ` +
        `Run without --only to update current/.`
    );
    await flushAndReport(warnings);
    if (failCount > 0) process.exitCode = 1;
    return;
  }

  let writeNew = false;
  let reason = "";

  if (!priorResolved) {
    writeNew = true;
    reason = "no existing current/ snapshot";
  } else if (!payloadsEqualToResolved(priorResolved, scraped)) {
    writeNew = true;
    reason = "content differs from current/";
  } else {
    console.log("Unchanged from current/. No update written.");
  }

  if (writeNew) {
    const scrapedAt = new Date().toISOString().slice(0, 10);
    const { priorDirName, factionCount } = await archiveAndWriteCurrent({
      siteVersion,
      scrapedAt,
      scraped,
      priorResolved,
    });
    if (priorDirName) {
      console.log(`Archived prior version to historical/${priorDirName}/.`);
    }
    console.log(
      `Wrote current/ (${reason}): ${factionCount} faction file(s), ` +
        `siteVersion = "${siteVersion.toUpperCase()}".`
    );
  }

  // Faction Pack PDF passes (keywords, enhancement restrictions, detachment
  // grants, errata) now live in scripts/scrape-faction-pack-11th/ and run as a
  // separate job that reads this snapshot. This scraper is points-only.

  await flushAndReport(warnings);

  if (failCount > 0) process.exitCode = 1;
}

async function flushAndReport(warnings) {
  const payload = await warnings.flush();
  const total = payload.warnings.length;
  if (total === 0) {
    console.log("\nNo warnings emitted.");
    return;
  }
  console.log(`\n${total} warning(s) written to .cache/_warnings.json:`);
  for (const [cat, n] of Object.entries(payload.counts).sort()) {
    console.log(`  ${cat.padEnd(28)} ${n}`);
  }
}

// Guard so importing this module (e.g. for its helpers in tests/tooling) doesn't
// kick off a live scrape — only run when invoked directly as the entry point.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
