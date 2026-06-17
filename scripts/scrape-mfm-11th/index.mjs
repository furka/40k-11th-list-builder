import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FACTION_SLUGS } from "./factions.mjs";
import { fetchFactionHtml } from "./fetch.mjs";
import { extractFactionData } from "./extract.mjs";
import { normalizeFactionData } from "./normalize.mjs";

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

async function listVersionDirs() {
  if (!existsSync(OUT_ROOT)) return [];
  const entries = await readdir(OUT_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // alphabetical = chronological because of YYYY-MM-DD suffix
}

async function readVersionDir(dirName) {
  const dirPath = join(OUT_ROOT, dirName);
  const manifestPath = join(dirPath, "_manifest.json");
  if (!existsSync(manifestPath)) return null;

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const factions = {};
  const entries = await readdir(dirPath);
  for (const fname of entries) {
    if (fname === "_manifest.json" || !fname.endsWith(".json")) continue;
    const slug = fname.replace(/\.json$/, "");
    factions[slug] = JSON.parse(await readFile(join(dirPath, fname), "utf8"));
  }
  return { manifest, factions };
}

function payloadsEqual(latest, scraped) {
  // latest.factions: { [slug]: payload }, scraped: Map<slug, payload>
  const latestKeys = Object.keys(latest.factions).sort();
  const scrapedKeys = [...scraped.keys()].sort();
  if (latestKeys.length !== scrapedKeys.length) return false;
  for (let i = 0; i < latestKeys.length; i++) {
    if (latestKeys[i] !== scrapedKeys[i]) return false;
    if (
      stableStringify(latest.factions[latestKeys[i]]) !==
      stableStringify(scraped.get(scrapedKeys[i]))
    ) {
      return false;
    }
  }
  return true;
}

async function writeVersionDir({ siteVersion, scrapedAt, scraped }) {
  const dirName = `${siteVersion.toLowerCase()}-${scrapedAt}`;
  const dirPath = join(OUT_ROOT, dirName);
  await ensureDir(dirPath);

  for (const [slug, payload] of scraped) {
    await writeFile(
      join(dirPath, `${slug}.json`),
      stableStringify(payload),
      "utf8"
    );
  }

  const manifest = { siteVersion, scrapedAt };
  await writeFile(
    join(dirPath, "_manifest.json"),
    stableStringify(manifest),
    "utf8"
  );

  return { dirName };
}

async function main() {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.split("=")[1].split(",") : null;

  await ensureDir(OUT_ROOT);

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

  const versionDirs = await listVersionDirs();
  const latestDirName = versionDirs[versionDirs.length - 1];
  const latest = latestDirName ? await readVersionDir(latestDirName) : null;

  if (!isFullScrape) {
    console.log(
      `Partial scrape (--only). Skipping version-dir write. ` +
        `Run without --only to produce a full version directory.`
    );
    if (failCount > 0) process.exitCode = 1;
    return;
  }

  let writeNew = false;
  let reason = "";

  if (!latest) {
    writeNew = true;
    reason = "no existing version directory";
  } else if (!payloadsEqual(latest, scraped)) {
    writeNew = true;
    reason = `content differs from latest ("${latestDirName}")`;
  } else {
    console.log(
      `Unchanged from latest ("${latestDirName}"). No new version directory written.`
    );
  }

  if (writeNew) {
    const scrapedAt = new Date().toISOString().slice(0, 10);
    const { dirName } = await writeVersionDir({
      siteVersion,
      scrapedAt,
      scraped,
    });
    console.log(`Wrote new version dir "${dirName}" (${reason}).`);
    console.log(`siteVersion = "${siteVersion.toUpperCase()}".`);
  }

  if (failCount > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
