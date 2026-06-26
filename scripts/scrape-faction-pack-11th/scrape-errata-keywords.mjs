// Standalone "Rules Updates" datasheet-keyword errata pass.
//
// Reads the committed MFM snapshot for each faction's datasheet vocabulary (so it
// runs independently of the MFM website scrape), fetches the cached Faction Pack
// PDF, routes ONLY the rules-update pages to the errata classifier, reconciles the
// extracted datasheet names back to canonical MFM spellings, and writes the
// keyword deltas to src/data/keywords/errata-keywords.auto.json.
//
// Output shape: { "<FACTION>": { "<DATASHEET>": { add: [...], remove: [...] } } }
//
// This is decoupled from index.mjs on purpose — it is the first pass of the
// standalone Faction Pack scraper and only depends on shared helpers.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

import { resolveSnapshotState } from "../scrape-mfm-11th/snapshot-resolve.mjs";
import { fetchFactionPackPdf } from "./fetch.mjs";
import { pdfToPages } from "./pdf-to-text.mjs";
import { PAGE_TYPE, filterPagesByType } from "./page-types.mjs";
import { enhancementNameKey } from "../scrape-mfm-11th/name-key.mjs";
import { createWarningSink } from "../scrape-mfm-11th/warnings.mjs";
import {
  classifyErrataKeywordsWithLLM,
  flushErrataKeywordCache,
} from "./llm-classify-errata-keywords.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MFM_ROOT = resolve(__dirname, "../../src/data/munitorum-field-manual-11th");
const FACTION_PACK_URLS_PATH = resolve(__dirname, "faction-pack-urls.json");
const ERRATA_OUT = resolve(
  __dirname,
  "../../src/data/keywords/errata-keywords.auto.json"
);

const stableStringify = (v) => JSON.stringify(v, null, 2);

// "Leader", "Support", and "Hover" live in a datasheet's Core Abilities section,
// not its Keywords line — they are ability categories the app derives from the
// `leader`/`support` fields, never datasheet keywords. Drop them deterministically
// so a Core-Abilities errata the LLM mis-files as a keyword change can't pollute
// the keyword set.
const NON_KEYWORD_TOKENS = new Set(["LEADER", "SUPPORT", "HOVER"]);
const keepKeywords = (arr) => arr.filter((k) => !NON_KEYWORD_TOKENS.has(k));

export async function scrapeErrataKeywords({
  refresh = false,
  warnings: providedWarnings,
} = {}) {
  // When run as part of the unified faction-pack scraper, the caller owns the
  // warning sink and flushes once at the end; standalone, we manage our own.
  const warnings = providedWarnings ?? createWarningSink("errata-keywords");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("Skipping errata pass: ANTHROPIC_API_KEY is not set.");
    return null;
  }
  const factionPackUrls = existsSync(FACTION_PACK_URLS_PATH)
    ? JSON.parse(await readFile(FACTION_PACK_URLS_PATH, "utf8"))
    : {};

  const resolved = await resolveSnapshotState(MFM_ROOT);
  if (!resolved) {
    console.warn("No MFM snapshots found — nothing to do.");
    return null;
  }
  const { factions } = resolved;
  const client = new Anthropic();

  const out = {};
  let totalChanges = 0;

  for (const [slug, payload] of Object.entries(factions)) {
    const factionName = payload.faction;
    const url = factionPackUrls[slug];
    if (!url) {
      warnings.add("errata-url-missing", { slug });
      continue;
    }

    let pages;
    try {
      const buf = await fetchFactionPackPdf(slug, url, { refresh });
      pages = await pdfToPages(buf);
    } catch (e) {
      warnings.add("errata-pdf-failed", { slug, message: e.message });
      continue;
    }

    const rulesUpdatePages = filterPagesByType(pages, PAGE_TYPE.RULES_UPDATE);
    if (rulesUpdatePages.length === 0) continue;

    const datasheetNames = payload.datasheets.map((d) => d.name);
    const datasheetByKey = new Map();
    for (const name of datasheetNames) {
      datasheetByKey.set(enhancementNameKey(name), name);
    }

    let result;
    try {
      const res = await classifyErrataKeywordsWithLLM({
        client,
        factionName,
        pageTexts: rulesUpdatePages,
        datasheetNames,
      });
      result = res.result;
    } catch (e) {
      warnings.add("errata-llm-failed", { slug, message: e.message });
      continue;
    }

    const factionOut = {};
    for (const change of result.changes) {
      for (const rawName of change.datasheets) {
        const canonical = datasheetByKey.get(enhancementNameKey(rawName));
        if (!canonical) {
          warnings.add("errata-datasheet-unmatched", { slug, name: rawName });
          continue;
        }
        const add = keepKeywords(change.add);
        const remove = keepKeywords(change.remove);
        if (add.length === 0 && remove.length === 0) continue;
        const entry = factionOut[canonical] ?? { add: [], remove: [] };
        for (const k of add) if (!entry.add.includes(k)) entry.add.push(k);
        for (const k of remove) if (!entry.remove.includes(k)) entry.remove.push(k);
        factionOut[canonical] = entry;
        totalChanges++;
      }
    }
    // Sort keyword lists + datasheet keys for stable output.
    for (const ds of Object.keys(factionOut)) {
      factionOut[ds].add.sort();
      factionOut[ds].remove.sort();
      if (factionOut[ds].add.length === 0) delete factionOut[ds].add;
      if (factionOut[ds].remove.length === 0) delete factionOut[ds].remove;
    }
    if (Object.keys(factionOut).length) {
      out[factionName] = Object.fromEntries(
        Object.keys(factionOut)
          .sort()
          .map((k) => [k, factionOut[k]])
      );
    }
  }

  await flushErrataKeywordCache();

  const payloadOut = {
    _source: "MFM Faction Pack PDFs — Rules Updates (errata) sections",
    _generator: "scripts/scrape-faction-pack-11th/scrape-errata-keywords.mjs",
    ...Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]])),
  };
  if (!existsSync(dirname(ERRATA_OUT))) await mkdir(dirname(ERRATA_OUT), { recursive: true });
  await writeFile(ERRATA_OUT, stableStringify(payloadOut) + "\n", "utf8");

  if (!providedWarnings) await warnings.flush();
  console.log(
    `Errata keyword pass: ${Object.keys(out).length} factions, ${totalChanges} datasheet changes. ` +
      `Warnings: ${JSON.stringify(warnings.countsByCategory())}`
  );
  return payloadOut;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const refresh = process.argv.includes("--refresh");
  scrapeErrataKeywords({ refresh }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
