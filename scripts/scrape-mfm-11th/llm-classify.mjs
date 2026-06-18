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

const SYSTEM_PROMPT = `You read a short Warhammer 40k enhancement rules excerpt and report the restriction in a structured form by calling the set_enhancement_restrictions tool.

Rules for filling each field:
- allowedHosts: array of UPPERCASE datasheet names from the provided list that the enhancement's host phrase names. Only include names that appear in the provided datasheet list verbatim (after uppercasing). [] if the host phrase is a keyword/role tag rather than a specific datasheet, or if there's no host restriction.
- requiredKeywords: array of UPPERCASE keyword/role tokens from the host phrase that do NOT appear in the provided datasheet list — e.g. "GRAVIS", "HERETIC ASTARTES VEHICLE", "LEGIONES DAEMONICA KHORNE". Both fields can be populated for the same restriction when the host phrase mixes a datasheet name with a keyword.
- characterOnly: true only if the text explicitly restricts to CHARACTER models/units.
- nonCharacterOnly: true only if the text marks this enhancement as an Upgrade applicable to non-CHARACTER units.
- notOnEpicHeroes: true only if the text excludes EPIC HEROES explicitly.
- limit: 1 or 2 if the text caps copies in the army ("Only one model in your army can have this enhancement", "Up to two…"). null otherwise.
- conditional: true if the host phrase is a trigger ("If your WARLORD has this enhancement…") rather than a constraint on who can take it.

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
    },
    required: [
      "allowedHosts",
      "requiredKeywords",
      "characterOnly",
      "nonCharacterOnly",
      "notOnEpicHeroes",
      "limit",
      "conditional",
    ],
  },
};

function makeCacheKey({ enhancementName, sectionText, datasheetNames }) {
  const h = createHash("sha256");
  h.update(MODEL_ID);
  h.update("\0");
  h.update(enhancementName);
  h.update("\0");
  h.update(sectionText);
  h.update("\0");
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
  sectionText,
  datasheetNames,
}) {
  const cache = await getCache();
  const key = makeCacheKey({ enhancementName, sectionText, datasheetNames });
  if (cache[key]) {
    return { restrictions: cache[key].response, cacheHit: true };
  }

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
          `Rules text excerpt from the Faction Pack:\n${sectionText}`,
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

  cache[key] = {
    response: restrictions,
    modelId: MODEL_ID,
    classifiedAt: new Date().toISOString(),
  };
  scheduleFlush(cache);

  return { restrictions, cacheHit: false };
}
