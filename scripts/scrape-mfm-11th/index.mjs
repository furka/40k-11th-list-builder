import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { FACTION_SLUGS } from "./factions.mjs";
import { fetchFactionHtml } from "./fetch.mjs";
import { extractFactionData } from "./extract.mjs";
import { normalizeFactionData } from "./normalize.mjs";
import { createWarningSink } from "./warnings.mjs";
import { listSnapshotDirs, resolveSnapshotState } from "./snapshot-resolve.mjs";
import { diffSnapshots } from "./diff-snapshot.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = resolve(__dirname, "../../src/data/munitorum-field-manual-11th");

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

async function scrapeOne(slug, { refresh }) {
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

// Sparse write: only emit faction JSONs whose payload differs from the
// resolved prior state. Always emit `_manifest.json` (for traceability) and
// `_changes.md` (the human-readable diff the PR workflow embeds).
async function writeVersionDir({
  siteVersion,
  scrapedAt,
  scraped,
  priorResolved,
  priorDirName,
}) {
  const dirName = `${siteVersion.toLowerCase()}-${scrapedAt}`;
  const dirPath = join(OUT_ROOT, dirName);
  await ensureDir(dirPath);

  const priorFactions = priorResolved?.factions ?? {};
  const writtenFactionSlugs = [];
  for (const [slug, payload] of scraped) {
    const newJson = stableStringify(payload);
    const priorPayload = priorFactions[slug];
    if (priorPayload !== undefined && stableStringify(priorPayload) === newJson) {
      continue;
    }
    await writeFile(join(dirPath, `${slug}.json`), newJson, "utf8");
    writtenFactionSlugs.push(slug);
  }

  const manifest = { siteVersion, scrapedAt };
  await writeFile(
    join(dirPath, "_manifest.json"),
    stableStringify(manifest),
    "utf8"
  );

  const priorMap = new Map(Object.entries(priorFactions));
  const nextMap = new Map(priorMap);
  for (const [slug, payload] of scraped) nextMap.set(slug, payload);
  const changesMd = diffSnapshots(priorMap, nextMap, {
    siteVersion: siteVersion.toUpperCase(),
    scrapedAt,
    priorDirName,
  });
  await writeFile(join(dirPath, "_changes.md"), changesMd + "\n", "utf8");

  return { dirName, writtenFactionSlugs };
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
      const payload = await scrapeOne(slug, { refresh });
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

  // If a --only run, splice the scraped factions into the most recent version
  // dir for comparison so we don't spuriously mint a new dir from a partial
  // scrape. Comparison only proceeds if the scrape covered every faction.
  const isFullScrape = !only;

  const versionDirs = await listSnapshotDirs(OUT_ROOT);
  const latestDirName = versionDirs[versionDirs.length - 1];
  const priorResolved = await resolveSnapshotState(OUT_ROOT);

  if (!isFullScrape) {
    console.log(
      `Partial scrape (--only). Skipping version-dir write. ` +
        `Run without --only to produce a full version directory.`
    );
    await flushAndReport(warnings);
    if (failCount > 0) process.exitCode = 1;
    return;
  }

  let writeNew = false;
  let reason = "";

  if (!priorResolved) {
    writeNew = true;
    reason = "no existing version directory";
  } else if (!payloadsEqualToResolved(priorResolved, scraped)) {
    writeNew = true;
    reason = `content differs from resolved state at "${latestDirName}"`;
  } else {
    console.log(
      `Unchanged from resolved state at "${latestDirName}". No new version directory written.`
    );
  }

  if (writeNew) {
    const scrapedAt = new Date().toISOString().slice(0, 10);
    const { dirName, writtenFactionSlugs } = await writeVersionDir({
      siteVersion,
      scrapedAt,
      scraped,
      priorResolved,
      priorDirName: latestDirName,
    });
    console.log(
      `Wrote sparse snapshot "${dirName}" (${reason}): ` +
        `${writtenFactionSlugs.length} of ${scraped.size} faction file(s) — ` +
        `${writtenFactionSlugs.join(", ") || "(none)"}.`
    );
    console.log(`siteVersion = "${siteVersion.toUpperCase()}".`);
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
