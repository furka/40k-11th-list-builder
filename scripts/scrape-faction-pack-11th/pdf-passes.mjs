// The three Faction Pack PDF classification passes — keywords, enhancement
// restrictions, and detachment BATTLELINE grants. Extracted verbatim from the
// old scrape-mfm-11th/index.mjs; the only change is that page selection is
// scoped by page type (see page-types.mjs) before the per-entity name match.
//
// Each pass takes the same shape as before — `(scraped, slugs, warnings, opts)`
// where `scraped` is a Map slug→faction payload — so the standalone faction-pack
// index.mjs drives them from a committed MFM snapshot instead of a live scrape.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchFactionPackPdf } from "./fetch.mjs";
import { pdfToPages } from "./pdf-to-text.mjs";
import {
  findEnhancementPages,
  findDetachmentRulesPages,
  findDatasheetPages,
} from "./find-section.mjs";
import { PAGE_TYPE, filterPagesByType } from "./page-types.mjs";
import {
  classifyWithLLM,
  flushLlmCache,
  repairRequiredKeywords,
} from "./llm-classify.mjs";
import { buildKeywordVocab } from "./keyword-vocab.mjs";
import {
  classifyDetachmentGrantsWithLLM,
  flushDetachmentGrantsCache,
} from "./llm-classify-detachment-grants.mjs";
import {
  classifyKeywordsWithLLM,
  flushKeywordCache,
  deriveConfusableSiblings,
} from "./llm-classify-keywords.mjs";
import { enhancementNameKey } from "../scrape-mfm-11th/name-key.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTION_PACK_URLS_PATH = resolve(__dirname, "faction-pack-urls.json");
const RESTRICTIONS_OUT = resolve(
  __dirname,
  "../../src/data/configs/enhancement-restrictions.auto.json"
);
const CONDITIONAL_GRANTS_OUT = resolve(
  __dirname,
  "../../src/data/configs/conditional-battleline.auto.json"
);
const KEYWORDS_OUT = resolve(
  __dirname,
  "../../src/data/keywords/faction-pack-keywords.auto.json"
);

async function ensureDir(path) {
  if (!existsSync(path)) await mkdir(path, { recursive: true });
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extracted PDF passes follow.
// ─────────────────────────────────────────────────────────────────────────────
async function scrapePdfRestrictionsForFaction(
  slug,
  factionPayload,
  factionPackUrls,
  warnings,
  llmClient,
  { refresh, factionKeywordVocab, globalKeywordVocab }
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

  let pages;
  try {
    pages = await pdfToPages(pdfBuf);
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

  // Enhancements are defined in detachment sections (the ENHANCEMENTS heading on
  // a detachment page), so only feed detachment-type pages to the classifier —
  // never datasheet stat blocks or errata prose that merely name the enhancement.
  const detachmentPages = filterPagesByType(pages, PAGE_TYPE.DETACHMENT);

  for (const enh of mfmEnhancements) {
    const matched = findEnhancementPages(detachmentPages, enh.name);
    if (!matched) {
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
        pageTexts: matched.pages,
        datasheetNames,
        factionKeywordVocab,
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

    if (restrictions.notDefined) {
      warnings.add("mfm-missing-in-pdf", { slug, name: enh.name });
      counts.mfmMissed++;
      continue;
    }

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

    // Repair requiredKeywords against the closed keyword vocab. Runs AFTER
    // allowedHosts demotion so orphaned hosts that turned out to be real
    // datasheet names get promoted back, multi-token concatenations get
    // split, and unknown tokens get dropped. See repairRequiredKeywords()
    // in llm-classify.mjs for the full contract.
    if (globalKeywordVocab) {
      const repairs = repairRequiredKeywords(restrictions, {
        globalKeywordVocab,
        datasheetByKey,
        nameKey: enhancementNameKey,
      });
      for (const r of repairs) {
        if (r.kind === "split") {
          warnings.add("requiredkeyword-split", { slug, name: enh.name, entry: r.entry, into: r.into });
        } else if (r.kind === "promoted-to-allowedHosts") {
          warnings.add("requiredkeyword-promoted", { slug, name: enh.name, entry: r.entry, datasheet: r.datasheet });
        } else if (r.kind === "dropped") {
          warnings.add("requiredkeyword-dropped", { slug, name: enh.name, entry: r.entry });
        }
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
  if (restrictions.nonCharacterOnly) out.nonCharacterOnly = true;
  if (typeof restrictions.limit === "number") out.limit = restrictions.limit;
  return out;
}

// Detachment-conditional keyword grants: for each MFM detachment, find its
// rules section in the PDF and ask the LLM whether it grants any composition
// keywords (currently only BATTLELINE) to specific datasheets. Output is the
// same shape consumed by src/utils/conditional-battleline.js — an array of
// rules per faction, each rule wrapping a typed trigger object.
//
// MFM-driven (not PDF-driven): we know what detachments exist from MFM. The
// scraper goes looking FOR each one's rules section, just like the
// enhancement pass goes looking for each enhancement.
async function scrapeDetachmentGrantsForFaction(
  slug,
  factionPayload,
  factionPackUrls,
  warnings,
  llmClient,
  { refresh }
) {
  const url = factionPackUrls[slug];
  if (!url) return null;
  let pdfBuf;
  try {
    pdfBuf = await fetchFactionPackPdf(slug, url, { refresh });
  } catch (e) {
    warnings.add("dgrants-pdf-fetch-failed", { slug, url, message: e.message });
    return null;
  }
  let pages;
  try {
    pages = await pdfToPages(pdfBuf);
  } catch (e) {
    warnings.add("dgrants-pdf-parse-failed", { slug, message: e.message });
    return null;
  }

  const datasheetNames = factionPayload.datasheets.map((d) => d.name);
  const datasheetByKey = new Map();
  for (const name of datasheetNames) datasheetByKey.set(enhancementNameKey(name), name);

  const rules = [];
  const counts = {
    detachments: factionPayload.detachments.length,
    sectionMissed: 0,
    classified: 0,
    cacheHits: 0,
    rulesEmitted: 0,
    failed: 0,
  };

  // Grants live either in a detachment's main rules section or in a "Rules
  // Updates" errata entry ("… DETACHMENT, Keywords Section Change to: '… gain the
  // BATTLELINE keyword'"), so scope to both those page types.
  const grantPages = filterPagesByType(
    pages,
    PAGE_TYPE.DETACHMENT,
    PAGE_TYPE.RULES_UPDATE
  );

  for (const det of factionPayload.detachments) {
    const matched = findDetachmentRulesPages(grantPages, det.name);
    if (!matched) {
      warnings.add("dgrants-section-missing-in-pdf", { slug, detachment: det.name });
      counts.sectionMissed++;
      continue;
    }

    let result;
    let cacheHit;
    try {
      const res = await classifyDetachmentGrantsWithLLM({
        client: llmClient,
        detachmentName: det.name,
        pageTexts: matched.pages,
        datasheetNames,
      });
      result = res.result;
      cacheHit = res.cacheHit;
    } catch (e) {
      warnings.add("dgrants-llm-call-failed", {
        slug,
        detachment: det.name,
        message: e.message,
      });
      counts.failed++;
      continue;
    }
    if (cacheHit) counts.cacheHits++;
    counts.classified++;

    if (result.notDefined) continue;
    if (!Array.isArray(result.grants) || result.grants.length === 0) continue;

    for (const grant of result.grants) {
      // Reconcile each unit name back to the canonical MFM string. Drop
      // anything that doesn't map — the prompt instructs the model to only
      // emit names from the closed vocabulary, but the safety check is cheap
      // and matches the enhancement classifier's posture.
      const canonical = [];
      for (const u of grant.units ?? []) {
        const real = datasheetByKey.get(enhancementNameKey(u));
        if (real) canonical.push(real);
      }
      if (canonical.length === 0) continue;

      const rule = {
        trigger: { type: "detachment", name: det.name },
      };
      const keyword = (grant.keyword ?? "").toUpperCase();
      if (keyword === "BATTLELINE") {
        rule.battleLine = canonical;
      } else {
        // Future-proof: emit anyway under a `keyword` field the runtime can
        // ignore until it learns about the new keyword.
        rule.keyword = keyword;
        rule.units = canonical;
      }
      rules.push(rule);
      counts.rulesEmitted++;
    }
  }

  console.log(
    `    ${counts.detachments} detachment(s), ${counts.classified} classified` +
      ` (${counts.rulesEmitted} rule(s) emitted, section-missing ${counts.sectionMissed},` +
      ` failed ${counts.failed}, cache-hits ${counts.cacheHits})`
  );
  return rules;
}

// Per-datasheet KEYWORDS line scrape. For each MFM datasheet, find its stat
// block in the Faction Pack PDF and ask the LLM to extract the KEYWORDS and
// FACTION KEYWORDS lines. Output goes into faction-pack-keywords.auto.json and is
// consumed by src/data/keywords/index.js as the middle priority layer
// (above BSData, below manual overrides).
//
// EXPECTED coverage gap: GW strips a datasheet from the MFM Faction Pack PDF
// once its codex is published — the codex is then the source of truth and
// the PDF only carries post-codex additions and errata. So per faction we
// typically classify ~20–40% of the MFM datasheets here; the rest are
// "kw-not-in-pdf" / "kw-stat-block-absent" warnings, which are FINE — the
// keyword loader falls back to BSData for those. The value of this pass is
// freshness on units BSData hasn't yet caught and errata that override the
// codex version.
async function scrapePdfKeywordsForFaction(
  slug,
  factionPayload,
  factionPackUrls,
  warnings,
  llmClient,
  { refresh }
) {
  const url = factionPackUrls[slug];
  if (!url) return null;
  let pdfBuf;
  try {
    pdfBuf = await fetchFactionPackPdf(slug, url, { refresh });
  } catch (e) {
    warnings.add("kw-pdf-fetch-failed", { slug, url, message: e.message });
    return null;
  }
  let pages;
  try {
    pages = await pdfToPages(pdfBuf);
  } catch (e) {
    warnings.add("kw-pdf-parse-failed", { slug, message: e.message });
    return null;
  }

  const out = {};
  const counts = {
    datasheets: factionPayload.datasheets.length,
    codexResident: 0, // name not in PDF at all — almost certainly codex-only
    statBlockAbsent: 0, // name only in cross-refs (codex-only or errata-only)
    classified: 0, // LLM saw a stat block and extracted keywords
    cacheHits: 0,
    empty: 0,
    failed: 0,
    leaked: 0, // sibling-datasheet leakage detected; entry dropped
  };

  // Set of every datasheet name in this faction, used by the classifier to
  // detect cross-stat-block leakage (when Haiku returns a neighbour's keyword
  // set verbatim because two stat blocks are flattened onto the same PDF
  // page). The current sheet is removed per-iteration below.
  const allSiblingNames = new Set(
    factionPayload.datasheets.map((d) => d.name.toUpperCase())
  );

  // Keywords come only from datasheet stat blocks, so restrict the reading
  // window to datasheet-type pages. A datasheet whose name appears only on
  // errata / detachment / stratagem pages (codex-resident — its stat block was
  // stripped from the pack when the codex shipped) yields no datasheet page and
  // falls back to BSData. This is the deterministic form of the old per-page
  // stat-block gate: it stops the LLM fabricating keywords from prose (the LAND
  // SPEEDER VENGEANCE → CHARACTER/MONSTER bug).
  const datasheetPages = filterPagesByType(pages, PAGE_TYPE.DATASHEET);

  for (const sheet of factionPayload.datasheets) {
    const matched = findDatasheetPages(datasheetPages, sheet.name);
    if (!matched) {
      if (findDatasheetPages(pages, sheet.name)) {
        warnings.add("kw-stat-block-absent", { slug, datasheet: sheet.name });
        counts.statBlockAbsent++;
      } else {
        warnings.add("kw-not-in-pdf", { slug, datasheet: sheet.name });
        counts.codexResident++;
      }
      continue;
    }

    const siblingDatasheetNames = new Set(allSiblingNames);
    siblingDatasheetNames.delete(sheet.name.toUpperCase());

    // Same-faction datasheets whose name overlaps this one (e.g. base "Captain"
    // vs "Captain on Bike") share keywords and confuse the classifier into
    // borrowing the wrong block; name them so the LLM returns notFound instead.
    const confusableSiblings = deriveConfusableSiblings(
      sheet.name,
      siblingDatasheetNames
    );

    let result;
    let cacheHit;
    let leaked;
    try {
      const res = await classifyKeywordsWithLLM({
        client: llmClient,
        datasheetName: sheet.name,
        pageTexts: matched.pages,
        factionName: factionPayload.faction,
        siblingDatasheetNames,
        confusableSiblings,
      });
      result = res.result;
      cacheHit = res.cacheHit;
      leaked = res.leaked;
    } catch (e) {
      warnings.add("kw-llm-call-failed", {
        slug,
        datasheet: sheet.name,
        message: e.message,
      });
      counts.failed++;
      continue;
    }
    if (cacheHit) counts.cacheHits++;
    if (leaked) {
      warnings.add("kw-leaked-datasheet-name", {
        slug,
        datasheet: sheet.name,
        leaked,
      });
      counts.leaked++;
    }

    if (result.notFound) {
      warnings.add("kw-stat-block-absent", { slug, datasheet: sheet.name });
      counts.statBlockAbsent++;
      continue;
    }

    const merged = [...new Set([...result.keywords, ...result.factionKeywords])].sort();
    if (merged.length === 0) {
      warnings.add("kw-empty-response", { slug, datasheet: sheet.name });
      counts.empty++;
      continue;
    }
    out[sheet.name] = merged;
    counts.classified++;
  }

  // Codex-resident + stat-block-absent are EXPECTED for any faction with a
  // published codex — those units fall back to BSData via the keyword
  // loader's layer merge. The "written" count is the freshness signal: that's
  // what BSData/manual can be superseded by.
  console.log(
    `    ${counts.datasheets} datasheet(s), ${counts.classified} written from PDF` +
      ` (codex-resident ${counts.codexResident + counts.statBlockAbsent},` +
      ` empty ${counts.empty}, failed ${counts.failed},` +
      ` leaked ${counts.leaked},` +
      ` cache-hits ${counts.cacheHits})`
  );
  return out;
}

export async function scrapePdfKeywords(scraped, slugs, warnings, { refresh, isFullScrape }) {
  if (!existsSync(FACTION_PACK_URLS_PATH)) {
    console.warn(
      `Skipping PDF keyword pass: ${FACTION_PACK_URLS_PATH} missing.`
    );
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      `Skipping PDF keyword pass: ANTHROPIC_API_KEY is not set.`
    );
    return;
  }
  const factionPackUrls = JSON.parse(
    readFileSync(FACTION_PACK_URLS_PATH, "utf8")
  );

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const llmClient = new Anthropic();

  let existing = {};
  if (!isFullScrape && existsSync(KEYWORDS_OUT)) {
    try {
      existing = JSON.parse(await readFile(KEYWORDS_OUT, "utf8"));
    } catch (e) {
      console.warn(`  ! could not parse existing ${KEYWORDS_OUT}: ${e.message}`);
    }
  }

  for (const slug of slugs) {
    const factionPayload = scraped.get(slug);
    if (!factionPayload) continue;
    try {
      process.stdout.write(`  ${slug} keywords …\n`);
      const factionOut = await scrapePdfKeywordsForFaction(
        slug,
        factionPayload,
        factionPackUrls,
        warnings,
        llmClient,
        { refresh }
      );
      if (factionOut === null) continue;
      if (Object.keys(factionOut).length > 0) {
        existing[factionPayload.faction] = factionOut;
      } else {
        delete existing[factionPayload.faction];
      }
    } catch (e) {
      warnings.add("kw-pdf-parse-failed", { slug, message: e.message });
    }
  }

  await flushKeywordCache();

  // Stable, sorted output: faction keys + (within each) datasheet keys, plus
  // a small header for traceability of which scrape produced this snapshot.
  const sortedFactions = {};
  for (const k of Object.keys(existing).filter((x) => !x.startsWith("_")).sort()) {
    const factionEntries = existing[k];
    const sortedSheets = {};
    for (const sk of Object.keys(factionEntries).sort()) {
      sortedSheets[sk] = factionEntries[sk];
    }
    sortedFactions[k] = sortedSheets;
  }
  const payload = {
    _source: "Warhammer 40,000 Faction Pack PDFs",
    _generatedAt: new Date().toISOString(),
    _generator: "scripts/scrape-faction-pack-11th",
    ...sortedFactions,
  };
  await ensureDir(dirname(KEYWORDS_OUT));
  await writeFile(KEYWORDS_OUT, stableStringify(payload) + "\n", "utf8");
  console.log(
    `Wrote ${Object.keys(sortedFactions).length} faction(s) to faction-pack-keywords.auto.json`
  );
}

export async function scrapeDetachmentGrants(scraped, slugs, warnings, { refresh, isFullScrape }) {
  if (!existsSync(FACTION_PACK_URLS_PATH)) {
    console.warn(
      `Skipping detachment-grants pass: ${FACTION_PACK_URLS_PATH} missing.`
    );
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      `Skipping detachment-grants pass: ANTHROPIC_API_KEY is not set.`
    );
    return;
  }
  const factionPackUrls = JSON.parse(
    readFileSync(FACTION_PACK_URLS_PATH, "utf8")
  );

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const llmClient = new Anthropic();

  let existing = {};
  if (!isFullScrape && existsSync(CONDITIONAL_GRANTS_OUT)) {
    try {
      existing = JSON.parse(await readFile(CONDITIONAL_GRANTS_OUT, "utf8"));
    } catch (e) {
      console.warn(`  ! could not parse existing ${CONDITIONAL_GRANTS_OUT}: ${e.message}`);
    }
  }

  for (const slug of slugs) {
    const factionPayload = scraped.get(slug);
    if (!factionPayload) continue;
    try {
      process.stdout.write(`  ${slug} detachment-grants …\n`);
      const rules = await scrapeDetachmentGrantsForFaction(
        slug,
        factionPayload,
        factionPackUrls,
        warnings,
        llmClient,
        { refresh }
      );
      if (rules === null) continue;
      if (rules.length > 0) {
        existing[factionPayload.faction] = rules;
      } else {
        delete existing[factionPayload.faction];
      }
    } catch (e) {
      warnings.add("dgrants-pdf-parse-failed", { slug, message: e.message });
    }
  }

  await flushDetachmentGrantsCache();

  const sorted = {};
  for (const k of Object.keys(existing).sort()) sorted[k] = existing[k];
  await writeFile(
    CONDITIONAL_GRANTS_OUT,
    stableStringify(sorted) + "\n",
    "utf8"
  );
  console.log(
    `Wrote ${Object.keys(sorted).length} faction(s) to conditional-battleline.auto.json`
  );
}

export async function scrapePdfRestrictions(scraped, slugs, warnings, { refresh, isFullScrape }) {
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

  // Build the closed keyword vocabulary the LLM gets (per-faction in the
  // prompt for cache efficiency, global for the post-LLM auto-repair pass).
  // Reads fresh from disk so the just-written faction-pack-keywords.auto.json
  // from the preceding PDF keyword pass is included.
  const { perFaction, global: globalKeywordVocab } = buildKeywordVocab();

  for (const slug of slugs) {
    const factionPayload = scraped.get(slug);
    if (!factionPayload) continue;
    const factionKeywordVocab = [...(perFaction.get(factionPayload.faction) ?? [])];
    try {
      process.stdout.write(`  ${slug} PDF …\n`);
      const out = await scrapePdfRestrictionsForFaction(
        slug,
        factionPayload,
        factionPackUrls,
        warnings,
        llmClient,
        { refresh, factionKeywordVocab, globalKeywordVocab }
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
