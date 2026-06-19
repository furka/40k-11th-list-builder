// LLM-driven enhancement classifier. Replaces the regex/layout-classifier
// from prior iterations.
//
// Per-call contract:
//   in:  { enhancementName, sectionText, datasheetNames }
//   out: { allowedHosts, requiredKeywords, characterOnly, nonCharacterOnly,
//          notOnEpicHeroes, limit, conditional }
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const CACHE_PATH = resolve(CACHE_DIR, "llm-classifications.json");

const MODEL_ID = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You read one or more raw text pages from a Warhammer 40k Faction Pack PDF, locate the section that DEFINES a named enhancement, and report its restrictions in a structured form by calling the set_enhancement_restrictions tool.

The pages may contain other rules (stratagems, detachment abilities, datasheets) that happen to mention the enhancement's name in passing — body-text references like "...for perfectly adapted ambush hunters..." or stratagems that name the enhancement as a trigger. Those are NOT the definition. The definition is a dedicated section under the "ENHANCEMENTS" heading, presented as the enhancement title (usually in ALL CAPS, often suffixed " UPGRADE" or " AURA") followed by flavour text and a host/effect clause like "RANGERS/SHROUD RUNNERS unit only." or "ADEPTUS ASTARTES PSYKER model only.".

If you cannot find such a definition section in the supplied pages — only stratagem references or flavour mentions — set notDefined: true and leave the other fields empty. Do not classify based on stratagem text or other rules that share the enhancement's name.

Rules for filling each field when the definition IS present:
- allowedHosts: array of UPPERCASE datasheet names from the provided list that the enhancement's host phrase names. Only include names that appear in the provided datasheet list verbatim (after uppercasing). [] if the host phrase is a keyword/role tag rather than a specific datasheet, or if there's no host restriction.
- requiredKeywords: array of UPPERCASE keyword/role tokens from the host phrase that do NOT appear in the provided datasheet list — e.g. "GRAVIS", "HERETIC ASTARTES VEHICLE", "LEGIONES DAEMONICA KHORNE". Both fields can be populated for the same restriction when the host phrase mixes a datasheet name with a keyword.
- characterOnly: true only if the text explicitly restricts to CHARACTER models/units.
- nonCharacterOnly: true only if the text marks this enhancement as an Upgrade applicable to non-CHARACTER units.
- notOnEpicHeroes: true only if the text excludes EPIC HEROES explicitly.
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
      characterOnly: { type: "boolean" },
      nonCharacterOnly: { type: "boolean" },
      notOnEpicHeroes: { type: "boolean" },
      limit: { type: ["integer", "null"] },
      conditional: { type: "boolean" },
      notDefined: { type: "boolean" },
    },
    required: [
      "allowedHosts",
      "requiredKeywords",
      "characterOnly",
      "nonCharacterOnly",
      "notOnEpicHeroes",
      "limit",
      "conditional",
      "notDefined",
    ],
  },
};

function makeCacheKey({ enhancementName, pageTexts, datasheetNames }) {
  const h = createHash("sha256");
  h.update(MODEL_ID);
  h.update("\0");
  h.update(enhancementName);
  h.update("\0");
  // Page order is meaningful (reflects the PDF) so don't sort here.
  for (const p of pageTexts) {
    h.update(p);
    h.update("\0");
  }
  // datasheetNames sorted for stability — order shouldn't affect the answer
  // but stable order keeps the cache key stable.
  h.update([...datasheetNames].sort().join("|"));
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
export async function classifyWithLLM({
  client,
  enhancementName,
  pageTexts,
  datasheetNames,
}) {
  const cache = await getCache();
  const key = makeCacheKey({ enhancementName, pageTexts, datasheetNames });
  if (cache[key]) {
    return { restrictions: cache[key].response, cacheHit: true };
  }

  const pagesBody = pageTexts
    .map((p, i) => `--- PAGE ${i + 1} ---\n${p}`)
    .join("\n\n");

  // Anthropic SDK call. System block carries the per-faction datasheet list
  // under cache_control so subsequent calls within the faction read the
  // ephemeral cache. tool_choice forces the model to return the schema.
  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 1024,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      {
        type: "text",
        text:
          "Faction datasheet names (the only allowedHosts you may emit):\n" +
          datasheetNames.join("\n"),
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
  const restrictions = toolBlock.input;
  assertWellFormed(restrictions);

  cache[key] = {
    response: restrictions,
    modelId: MODEL_ID,
    classifiedAt: new Date().toISOString(),
  };
  scheduleFlush(cache);

  return { restrictions, cacheHit: false };
}

// Sanity check the structured response before caching it. Haiku occasionally
// emits literal tool-use XML syntax inside a string-array field — the parser
// then splits the string character-by-character, producing arrays full of
// single-character entries. Catch that and throw so the caller surfaces a
// `llm-call-failed` warning and the entry isn't written to the auto.json.
function assertWellFormed(restrictions) {
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
