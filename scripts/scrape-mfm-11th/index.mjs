import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FACTION_SLUGS } from "./factions.mjs";
import { fetchFactionHtml, fetchFactionPackPdf } from "./fetch.mjs";
import { extractFactionData } from "./extract.mjs";
import { normalizeFactionData } from "./normalize.mjs";
import { pdfToText } from "./pdf-to-text.mjs";
import { findEnhancementSection } from "./find-section.mjs";
import { classifyWithLLM, flushLlmCache } from "./llm-classify.mjs";
import { enhancementNameKey } from "./name-key.mjs";
import { createWarningSink } from "./warnings.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = resolve(__dirname, "../../src/data/munitorum-field-manual-11th");
const FACTION_PACK_URLS_PATH = resolve(__dirname, "faction-pack-urls.json");
const RESTRICTIONS_OUT = resolve(
  __dirname,
  "../../src/data/configs/enhancement-restrictions.auto.json"
);

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

// PDF pass: for each MFM enhancement, find its section in the PDF text and
// ask Claude Haiku to classify the restriction (allowedHosts / requiredKeywords
// / characterOnly / nonCharacterOnly / notOnEpicHeroes / limit / conditional).
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
async function scrapePdfRestrictionsForFaction(
  slug,
  factionPayload,
  factionPackUrls,
  warnings,
  llmClient,
  { refresh }
) {
  const url = factionPackUrls[slug];
  if (!url) {
    warnings.add("pdf-url-missing", { slug });
    return null;
  }
  let pdfBuf;
  try {
    pdfBuf = await fetchFactionPackPdf(slug, url, { refresh });
  } catch (e) {
    warnings.add("pdf-fetch-failed", { slug, url, message: e.message });
    return null;
  }

  let text;
  try {
    text = await pdfToText(pdfBuf);
  } catch (e) {
    warnings.add("pdf-parse-failed", { slug, message: e.message });
    return null;
  }

  // Datasheet names are uppercase in MFM already — pass them through as the
  // closed vocabulary the LLM may choose allowedHosts from.
  const datasheetNames = factionPayload.datasheets.map((d) => d.name);
  // Key → canonical-name lookup for reconciling the LLM's allowedHosts back
  // to the EXACT MFM datasheet string. The LLM occasionally swaps curly
  // apostrophes (U+2019) for straight ones (U+0027) or otherwise normalises
  // unicode punctuation, which silently breaks the validator's byte-exact
  // `host.name` match downstream.
  const datasheetByKey = new Map();
  for (const name of datasheetNames) datasheetByKey.set(enhancementNameKey(name), name);

  // Build a flat list of MFM enhancements for this faction. The same name
  // can recur across detachments — dedupe by name; restrictions are the
  // same regardless of which detachment took it.
  const seen = new Set();
  const mfmEnhancements = [];
  for (const d of factionPayload.detachments) {
    for (const e of d.enhancements ?? []) {
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      mfmEnhancements.push(e);
    }
  }

  const out = {};
  const counts = {
    mfmMissed: 0,
    classified: 0,
    cacheHits: 0,
    conditional: 0,
    failed: 0,
    empty: 0,
  };

  for (const enh of mfmEnhancements) {
    const section = findEnhancementSection(text, enh.name);
    if (!section) {
      warnings.add("mfm-missing-in-pdf", { slug, name: enh.name });
      counts.mfmMissed++;
      continue;
    }

    let restrictions;
    let cacheHit;
    try {
      const result = await classifyWithLLM({
        client: llmClient,
        enhancementName: enh.name,
        sectionText: section.snippet,
        datasheetNames,
      });
      restrictions = result.restrictions;
      cacheHit = result.cacheHit;
    } catch (e) {
      warnings.add("llm-call-failed", {
        slug,
        name: enh.name,
        message: e.message,
      });
      counts.failed++;
      continue;
    }
    if (cacheHit) counts.cacheHits++;

    if (restrictions.conditional) {
      warnings.add("classifier-conditional", { slug, title: enh.name });
      counts.conditional++;
      continue;
    }

    // Reconcile any allowedHosts back to canonical MFM datasheet strings —
    // see datasheetByKey comment above. Anything that doesn't map to a real
    // datasheet drops to requiredKeywords (it's a keyword phrase or a
    // hallucination, not a valid host).
    if (restrictions.allowedHosts?.length) {
      const canonical = [];
      const orphaned = [];
      for (const h of restrictions.allowedHosts) {
        const real = datasheetByKey.get(enhancementNameKey(h));
        if (real) canonical.push(real);
        else orphaned.push(h);
      }
      restrictions.allowedHosts = canonical;
      if (orphaned.length) {
        restrictions.requiredKeywords = [
          ...(restrictions.requiredKeywords ?? []),
          ...orphaned,
        ];
      }
    }

    // Drop empty arrays and falsy booleans/null so the persisted JSON stays
    // clean. The LLM returns every field every time (forced by the tool
    // schema's `required`); we only persist what's positively set.
    const cleaned = dropEmptyFields(restrictions);
    if (Object.keys(cleaned).length === 0) {
      warnings.add("llm-empty-response", { slug, name: enh.name });
      counts.empty++;
      continue;
    }
    out[enh.name] = cleaned;
    counts.classified++;
  }

  console.log(
    `    ${mfmEnhancements.length} mfm entries, ${counts.classified} persisted` +
      ` (mfm-missing ${counts.mfmMissed}, conditional ${counts.conditional},` +
      ` empty ${counts.empty}, failed ${counts.failed}, cache-hits ${counts.cacheHits})`
  );
  return out;
}

function dropEmptyFields(restrictions) {
  const out = {};
  if (restrictions.allowedHosts?.length) out.allowedHosts = restrictions.allowedHosts;
  if (restrictions.requiredKeywords?.length) out.requiredKeywords = restrictions.requiredKeywords;
  if (restrictions.characterOnly) out.characterOnly = true;
  if (restrictions.nonCharacterOnly) out.nonCharacterOnly = true;
  if (restrictions.notOnEpicHeroes) out.notOnEpicHeroes = true;
  if (typeof restrictions.limit === "number") out.limit = restrictions.limit;
  return out;
}

async function scrapePdfRestrictions(scraped, slugs, warnings, { refresh, isFullScrape }) {
  if (!existsSync(FACTION_PACK_URLS_PATH)) {
    console.warn(
      `Skipping PDF pass: ${FACTION_PACK_URLS_PATH} missing. Run discover-faction-pack-urls.mjs first.`
    );
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    warnings.add("llm-api-key-missing", {});
    console.warn(
      `Skipping PDF pass: ANTHROPIC_API_KEY is not set.\n` +
        `  The LLM classifier is required for this pipeline; the existing\n` +
        `  enhancement-restrictions.auto.json is left untouched. Set the env\n` +
        `  var to a Claude API key and re-run when you want to refresh.`
    );
    return;
  }
  const factionPackUrls = JSON.parse(
    readFileSync(FACTION_PACK_URLS_PATH, "utf8")
  );

  // Anthropic SDK is lazily imported so the rest of the pipeline (MFM scrape,
  // version-dir write) still runs in environments that haven't installed it
  // (e.g. a CI build that only validates the existing JSON).
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const llmClient = new Anthropic();

  // Full scrape: start blank so factions removed from the slug list (or whose
  // enhancement names changed) don't leave stale entries behind. Partial
  // scrape: load existing .auto.json and update only the slugs we're touching.
  let restrictions = {};
  if (!isFullScrape && existsSync(RESTRICTIONS_OUT)) {
    try {
      restrictions = JSON.parse(await readFile(RESTRICTIONS_OUT, "utf8"));
    } catch (e) {
      console.warn(`  ! could not parse existing ${RESTRICTIONS_OUT}: ${e.message}`);
    }
  }

  for (const slug of slugs) {
    const factionPayload = scraped.get(slug);
    if (!factionPayload) continue;
    try {
      process.stdout.write(`  ${slug} PDF …\n`);
      const out = await scrapePdfRestrictionsForFaction(
        slug,
        factionPayload,
        factionPackUrls,
        warnings,
        llmClient,
        { refresh }
      );
      if (out === null) continue;
      if (Object.keys(out).length > 0) {
        restrictions[factionPayload.faction] = out;
      } else {
        delete restrictions[factionPayload.faction];
      }
    } catch (e) {
      warnings.add("pdf-parse-failed", { slug, message: e.message });
    }
  }

  // Make sure any cache writes the batched flush hasn't gotten to are
  // persisted before we exit.
  await flushLlmCache();

  const sorted = {};
  for (const k of Object.keys(restrictions).sort()) sorted[k] = restrictions[k];
  await writeFile(
    RESTRICTIONS_OUT,
    stableStringify(sorted) + "\n",
    "utf8"
  );
  console.log(
    `Wrote ${Object.keys(sorted).length} faction(s) to enhancement-restrictions.auto.json`
  );
}

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

  const versionDirs = await listVersionDirs();
  const latestDirName = versionDirs[versionDirs.length - 1];
  const latest = latestDirName ? await readVersionDir(latestDirName) : null;

  if (!isFullScrape) {
    console.log(
      `Partial scrape (--only). Skipping version-dir write. ` +
        `Run without --only to produce a full version directory.`
    );
    console.log("\nFaction Pack PDF pass …");
    await scrapePdfRestrictions(scraped, slugs, warnings, { refresh, isFullScrape });
    await flushAndReport(warnings);
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

  console.log("\nFaction Pack PDF pass …");
  await scrapePdfRestrictions(scraped, slugs, warnings, { refresh, isFullScrape });

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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
