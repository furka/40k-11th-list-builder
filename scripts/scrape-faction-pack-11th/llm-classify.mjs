// LLM-driven enhancement classifier. Replaces the regex/layout-classifier
// from prior iterations.
//
// Per-call contract:
//   in:  { enhancementName, sectionText, datasheetNames }
//   out: { allowedHosts, requiredKeywords, nonCharacterOnly, limit, conditional }
//
// Two layers of caching reduce cost and latency:
//
// 1. Anthropic prompt caching — the system prompt + per-faction datasheet
//    name list is sent in a cache_control: "ephemeral" block. Sequential
//    calls within a faction read the cache; small factions whose prefix
//    falls under the model's minimum cacheable size just don't cache, no
//    harm done. (Haiku 4.5 minimum is 4096 tokens.)
//
// 2. Local content-hash cache — responses are keyed by sha256 of
//    (modelId + enhancementName + sectionText + datasheetNames). Stored in
//    .cache/llm-classifications.json (gitignored). Re-running an unchanged
//    scrape makes zero API calls.

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { splitAgainstVocab } from "./keyword-vocab.mjs";
import { normalizeApostrophesDeep } from "../../src/utils/apostrophe-normalization.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const CACHE_PATH = resolve(CACHE_DIR, "llm-classifications.json");

export const MODEL_ID = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You read one or more raw text pages from a Warhammer 40k Faction Pack PDF, locate the section that DEFINES a named enhancement, and report its restrictions in a structured form by calling the set_enhancement_restrictions tool.

The pages may contain other rules (stratagems, detachment abilities, datasheets) that happen to mention the enhancement's name in passing — body-text references like "...for perfectly adapted ambush hunters..." or stratagems that name the enhancement as a trigger. Those are NOT the definition. The definition is a dedicated section under the "ENHANCEMENTS" heading, presented as the enhancement title (usually in ALL CAPS, often suffixed " UPGRADE" or " AURA") followed by flavour text and a host/effect clause like "RANGERS/SHROUD RUNNERS unit only." or "ADEPTUS ASTARTES PSYKER model only.".

If you cannot find such a definition section in the supplied pages — only stratagem references or flavour mentions — set notDefined: true and leave the other fields empty. Do not classify based on stratagem text or other rules that share the enhancement's name.

Rules for filling each field when the definition IS present. allowedHosts and requiredKeywords describe WHO may take the enhancement; pick ONE representation per host and never put the same token in both:
- requiredKeywords (DEFAULT): array of ATOMIC UPPERCASE keywords from the provided faction keyword vocabulary that the host model must have — a CONJUNCTION (the host must have ALL of them). Use this for any keyword/role host, including a single named model. Each entry MUST be a single keyword exactly as it appears in that vocabulary — NEVER concatenate two keywords into one string. "ADEPTUS CUSTODES WALKER model only" → ["ADEPTUS CUSTODES", "WALKER"]; "LEGIONES DAEMONICA KHORNE MONSTER model only" → ["LEGIONES DAEMONICA", "KHORNE", "MONSTER"]; "CHAPLAIN model only" → ["CHAPLAIN"] (matches every Chaplain variant). If a token isn't in the vocabulary, omit it.
- allowedHosts: array of UPPERCASE datasheet names from the provided list, used ONLY when the host phrase lists TWO OR MORE alternative specific units ("Captain, Chaplain or Lieutenant model only" → ["CAPTAIN", "CHAPLAIN", "LIEUTENANT"]) — a DISJUNCTION that a single keyword conjunction can't express. Do NOT use allowedHosts for a single host; do NOT also repeat those names in requiredKeywords. [] otherwise.
- Never list mutually-exclusive alternatives in requiredKeywords (no model can be a Captain AND a Chaplain — that's an OR, so use allowedHosts).
- limit: 1 or 2 if the text caps copies in the army ("Only one model in your army can have this enhancement", "Up to two…"). null otherwise.
- conditional: true if the host phrase is a trigger ("If your WARLORD has this enhancement…") rather than a constraint on who can take it.
- notDefined: true only when the enhancement is not actually defined in the supplied pages.

Do not invent restrictions the text doesn't state.`;

const RESTRICTION_TOOL = {
  name: "set_enhancement_restrictions",
  description: "Record the parsed restriction object for this enhancement.",
  input_schema: {
    type: "object",
    properties: {
      allowedHosts: { type: "array", items: { type: "string" } },
      requiredKeywords: { type: "array", items: { type: "string" } },
      limit: { type: ["integer", "null"] },
      conditional: { type: "boolean" },
      notDefined: { type: "boolean" },
    },
    required: [
      "allowedHosts",
      "requiredKeywords",
      "limit",
      "conditional",
      "notDefined",
    ],
  },
};

// Narrow a faction's datasheet roster (or keyword vocab) to just the tokens
// that actually appear in the PDF pages for this classification. The PROMPT
// still gets the full set (closed vocabulary unchanged), but the cache key
// only needs to depend on tokens that could plausibly affect THIS
// enhancement's answer. Without this narrowing, adding/renaming any single
// datasheet (or keyword) in a faction invalidates the cache for every
// enhancement in the faction.
function narrowToPages(tokens, pageTexts) {
  const haystack = pageTexts.join("\n").toLowerCase()
    .replace(/[‘’]/g, "'");
  return tokens.filter((tok) => {
    const needle = tok.toLowerCase().replace(/[‘’]/g, "'");
    return haystack.includes(needle);
  });
}

// v3 invalidates v2 caches built before requiredKeywords got a closed
// vocabulary — the prompt and post-validator differ enough that previous
// responses can't be reused. v4: temperature dropped to 0 and the
// nonCharacterOnly field removed from the schema/prompt — old entries are
// recomputed once, deterministically.
// Exported so the per-faction fingerprint gate re-runs this pass on a bump.
export const RESTRICTION_CACHE_VERSION = "v4";

function makeCacheKey({ enhancementName, pageTexts, datasheetNames, factionKeywordVocab }) {
  const h = createHash("sha256");
  h.update(`${RESTRICTION_CACHE_VERSION}:`);
  h.update(MODEL_ID);
  h.update("\0");
  h.update(enhancementName);
  h.update("\0");
  // Page order is meaningful (reflects the PDF) so don't sort here.
  for (const p of pageTexts) {
    h.update(p);
    h.update("\0");
  }
  // Sorted for stability — order shouldn't affect the answer but stable order
  // keeps the cache key stable.
  h.update([...datasheetNames].sort().join("|"));
  h.update("\0");
  h.update([...(factionKeywordVocab ?? [])].sort().join("|"));
  return h.digest("hex");
}

async function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

let cachePromise = null;
let pendingFlush = false;
let flushTimer = null;

async function getCache() {
  if (!cachePromise) cachePromise = loadCache();
  return cachePromise;
}

function scheduleFlush(cache) {
  pendingFlush = true;
  if (flushTimer) return;
  // Coalesce frequent writes (one save batches everything within ~500ms).
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (!pendingFlush) return;
    pendingFlush = false;
    await saveCache(cache);
  }, 500);
}

export async function flushLlmCache() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!pendingFlush) return;
  pendingFlush = false;
  const cache = await getCache();
  await saveCache(cache);
}

// Single-call classification. The caller is responsible for awaiting calls
// sequentially within a faction so prompt caching can fire.
//
// `factionKeywordVocab` is the per-faction list of atomic keywords (one of
// these per array entry — never concatenations) that the LLM may emit in
// `requiredKeywords`. Post-response repair (splitting concatenations,
// promoting stray datasheet names to allowedHosts) lives in the caller in
// index.mjs so it runs AFTER allowedHosts orphan-demotion as well; see
// `repairRequiredKeywords` exported below.
export async function classifyWithLLM({
  client,
  enhancementName,
  pageTexts,
  datasheetNames,
  factionKeywordVocab = [],
}) {
  const cache = await getCache();
  const key = makeCacheKey({
    enhancementName,
    pageTexts,
    datasheetNames: narrowToPages(datasheetNames, pageTexts),
    factionKeywordVocab: narrowToPages(factionKeywordVocab, pageTexts),
  });
  if (cache[key]) {
    return {
      restrictions: cache[key].response,
      cacheHit: true,
    };
  }

  if (process.env.MFM_SCRAPE_CACHE_ONLY === "1") {
    throw new Error(`cache-only mode: no cached response for ${enhancementName}`);
  }

  const pagesBody = pageTexts
    .map((p, i) => `--- PAGE ${i + 1} ---\n${p}`)
    .join("\n\n");

  // Anthropic SDK call. System block carries the per-faction datasheet list
  // and keyword vocab under cache_control so subsequent calls within the
  // faction read the ephemeral cache. tool_choice forces the model to return
  // the schema.
  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 1024,
    // Deterministic decoding: the same PDF text must classify to the same
    // result on every run, so a cache miss (e.g. a scraper refactor) produces
    // a no-op diff rather than nondeterministic churn.
    temperature: 0,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      {
        type: "text",
        text:
          "Faction datasheet names (the only allowedHosts you may emit):\n" +
          datasheetNames.join("\n"),
      },
      {
        type: "text",
        text:
          "Faction keyword vocabulary (the only requiredKeywords tokens you may emit; each entry MUST appear in this list verbatim, never concatenated):\n" +
          factionKeywordVocab.join("\n"),
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [RESTRICTION_TOOL],
    tool_choice: { type: "tool", name: RESTRICTION_TOOL.name },
    messages: [
      {
        role: "user",
        content:
          `Enhancement: ${enhancementName}\n\n` +
          `Faction Pack PDF pages that mention this name ` +
          `(${pageTexts.length} page${pageTexts.length === 1 ? "" : "s"}):\n\n` +
          pagesBody,
      },
    ],
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock) {
    throw new Error(
      `Model did not call the restriction tool (stop_reason=${response.stop_reason})`
    );
  }
  // Canonicalize apostrophe variants in the LLM-extracted strings before
  // caching — Haiku occasionally emits a STRAIGHT apostrophe even when the
  // source PDF text used a CURLY one, and the runtime validator does a
  // byte-exact `host.name === entry` match. Normalizing here keeps the
  // cache and the persisted enhancement-restrictions.auto.json honest.
  const restrictions = normalizeApostrophesDeep(toolBlock.input);
  assertNotCharacterCorrupted(restrictions);

  cache[key] = {
    response: restrictions,
    modelId: MODEL_ID,
    classifiedAt: new Date().toISOString(),
  };
  scheduleFlush(cache);

  return { restrictions, cacheHit: false };
}

// First-line sanity check. Haiku occasionally emits literal tool-use XML
// syntax inside a string-array field — the parser then splits the string
// character-by-character, producing arrays full of single-character entries.
// Catch that and throw so the caller surfaces a `llm-call-failed` warning
// and the entry isn't written to the auto.json.
function assertNotCharacterCorrupted(restrictions) {
  for (const field of ["allowedHosts", "requiredKeywords"]) {
    const arr = restrictions?.[field];
    if (!Array.isArray(arr)) continue;
    if (arr.some((x) => typeof x !== "string" || x.length <= 1)) {
      throw new Error(
        `Corrupted ${field} (single-character entries): ${JSON.stringify(arr).slice(0, 200)}`
      );
    }
  }
}

// Post-LLM auto-repair for requiredKeywords entries that aren't in the global
// keyword vocabulary. The closed-vocab prompt fixes most cases at source, but
// Haiku occasionally concatenates or hallucinates anyway — this pass:
//
//   1. Splits multi-token concatenations against the global vocab when the
//      pieces tile exactly ("ADEPTUS CUSTODES WALKER" → ["ADEPTUS CUSTODES",
//      "WALKER"]).
//   2. Promotes datasheet names that landed in requiredKeywords by mistake to
//      allowedHosts ("WORLD EATERS DAEMON PRINCE" — a real datasheet).
//   3. Drops everything else with a "dropped" repair record so the caller can
//      surface a warning.
//
// Uses the GLOBAL vocab (union across factions) rather than per-faction, so
// universal role keywords like CHARACTER/PSYKER aren't rejected just because
// the LLM was wrong about which faction owns them.
//
// Returns an array of repair records for telemetry/warnings. Mutates
// `restrictions` in place.
export function repairRequiredKeywords(restrictions, { globalKeywordVocab, datasheetByKey, nameKey }) {
  const repairs = [];
  const reqs = restrictions?.requiredKeywords;
  if (!Array.isArray(reqs) || reqs.length === 0) return repairs;
  if (!globalKeywordVocab) return repairs;

  const fixed = [];
  for (const entry of reqs) {
    if (typeof entry !== "string" || !entry) continue;
    if (globalKeywordVocab.has(entry)) {
      fixed.push(entry);
      continue;
    }
    const split = splitAgainstVocab(entry, globalKeywordVocab);
    if (split && split.length > 1) {
      fixed.push(...split);
      repairs.push({ kind: "split", entry, into: split });
      continue;
    }
    if (datasheetByKey && nameKey) {
      const datasheet = datasheetByKey.get(nameKey(entry));
      if (datasheet) {
        const hosts = (restrictions.allowedHosts ??= []);
        if (!hosts.includes(datasheet)) hosts.push(datasheet);
        repairs.push({ kind: "promoted-to-allowedHosts", entry, datasheet });
        continue;
      }
    }
    repairs.push({ kind: "dropped", entry });
  }

  const deduped = [...new Set(fixed)];
  if (deduped.length > 0) restrictions.requiredKeywords = deduped;
  else delete restrictions.requiredKeywords;
  return repairs;
}
