// LLM-driven classifier for detachment-level keyword grants. Mirrors
// llm-classify.mjs almost verbatim — same prompt-cache structure, same
// content-hash cache file, same well-formedness assertions — but the prompt,
// tool schema, and cache-key prefix are distinct so the two classifiers
// coexist without collisions.
//
// Per-call contract:
//   in:  { detachmentName, pageTexts, datasheetNames }
//   out: { grants: [ { keyword, units: [...] } ], notDefined }
//
// `keyword` is restricted to "BATTLELINE" today. The schema (and consumer in
// index.mjs) already wraps each rule with a `trigger.type === "detachment"`
// object so a future warlord-/enhancement-conditional classifier can append
// rules of a different trigger type to the same auto.json without breaking
// older clients.

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const CACHE_PATH = resolve(CACHE_DIR, "llm-classifications.json");

const MODEL_ID = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You read one or more raw text pages from a Warhammer 40k Faction Pack PDF, locate the section that defines a named detachment's rules, and report any rules that grant a composition keyword (currently only BATTLELINE) to specific datasheets, by calling the set_detachment_grants tool.

The relevant section may appear in either of two places:

1. The detachment's main rules section, headed by the detachment name followed by "DETACHMENT RULES" (e.g. "TAKTIKAL BRIGADE DETACHMENT RULES"). It contains the detachment's named ability and its bullet effects.

2. The faction's "Rules Updates" / errata section. Entries here are headed by the detachment name followed by "DETACHMENT" (without "RULES") and contain entries like 'Keywords Section Change to: "X units from your army gain the BATTLELINE keyword."' — these are errata that retroactively grant a keyword. Treat them exactly like a main-section grant: emit the same rule.

We are looking ONLY for unconditional grants that follow from selecting this detachment — phrasings like:
- "Friendly X units have BATTLELINE."
- "X units from your army gain the BATTLELINE keyword."
- "X units from your army have: BATTLELINE."
- 'Keywords Section Change to: "X units from your army gain the BATTLELINE keyword."'

Rules to follow:
- ONLY include grants tied to THIS detachment. The errata pages list multiple detachments at once — only emit grants under the "{name} DETACHMENT" subheading matching the detachment you were asked about. Do NOT include rules from other detachments, datasheets, enhancements, or stratagems.
- DO NOT include grants that are conditional on a warlord (e.g. "If a friendly X model is your WARLORD, …"). Set notDefined: false and just omit them from the grants array — a future warlord-classifier pass handles those.
- DO NOT include game-turn effects (stratagems, fight-phase triggers, etc.) that REFERENCE existing BATTLELINE units rather than grant the keyword.
- units: array of UPPERCASE datasheet names taken verbatim from the provided datasheet list. Only emit names that appear in that list (after uppercasing and ignoring punctuation differences). If the PDF names a unit via a slash list (e.g. "TYRANID WARRIORS WITH RANGED BIO-WEAPONS/TYRANID WARRIORS WITH MELEE BIO-WEAPONS"), expand it into multiple entries.
- If no qualifying grants are present in the supplied pages, return grants: [].
- notDefined: true ONLY if you cannot find the detachment's rules section anywhere in the supplied pages (a "MFM has it, PDF doesn't" situation). When you set notDefined: true, leave grants empty.

Do not invent grants the text doesn't state. Do not include partial grants — every emitted unit name must be verbatim in the closed datasheet list.`;

const GRANTS_TOOL = {
  name: "set_detachment_grants",
  description:
    "Record any rules in this detachment that grant a keyword to specific datasheets.",
  input_schema: {
    type: "object",
    properties: {
      grants: {
        type: "array",
        items: {
          type: "object",
          properties: {
            keyword: { type: "string", enum: ["BATTLELINE"] },
            units: { type: "array", items: { type: "string" } },
          },
          required: ["keyword", "units"],
        },
      },
      notDefined: { type: "boolean" },
    },
    required: ["grants", "notDefined"],
  },
};

function makeCacheKey({ detachmentName, pageTexts, datasheetNames }) {
  const h = createHash("sha256");
  h.update("detachment-grants:");
  h.update(MODEL_ID);
  h.update("\0");
  // The system prompt drives extraction behaviour — hash it so a prompt
  // edit invalidates stale entries instead of returning the prior result.
  h.update(SYSTEM_PROMPT);
  h.update("\0");
  h.update(detachmentName);
  h.update("\0");
  for (const p of pageTexts) {
    h.update(p);
    h.update("\0");
  }
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
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (!pendingFlush) return;
    pendingFlush = false;
    await saveCache(cache);
  }, 500);
}

export async function flushDetachmentGrantsCache() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!pendingFlush) return;
  const cache = await getCache();
  pendingFlush = false;
  await saveCache(cache);
}

export async function classifyDetachmentGrantsWithLLM({
  client,
  detachmentName,
  pageTexts,
  datasheetNames,
}) {
  const cache = await getCache();
  const key = makeCacheKey({ detachmentName, pageTexts, datasheetNames });
  if (cache[key]) {
    return { result: cache[key].response, cacheHit: true };
  }

  const pagesBody = pageTexts
    .map((p, i) => `--- PAGE ${i + 1} ---\n${p}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 1024,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      {
        type: "text",
        text:
          "Faction datasheet names (the only unit names you may emit):\n" +
          datasheetNames.join("\n"),
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [GRANTS_TOOL],
    tool_choice: { type: "tool", name: GRANTS_TOOL.name },
    messages: [
      {
        role: "user",
        content:
          `Detachment: ${detachmentName}\n\n` +
          `Faction Pack PDF pages that mention "${detachmentName} DETACHMENT RULES" ` +
          `(${pageTexts.length} page${pageTexts.length === 1 ? "" : "s"}):\n\n` +
          pagesBody,
      },
    ],
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock) {
    throw new Error(
      `Model did not call the grants tool (stop_reason=${response.stop_reason})`
    );
  }
  const result = toolBlock.input;
  assertWellFormed(result);

  cache[key] = {
    response: result,
    modelId: MODEL_ID,
    classifiedAt: new Date().toISOString(),
  };
  scheduleFlush(cache);

  return { result, cacheHit: false };
}

function assertWellFormed(result) {
  if (!Array.isArray(result?.grants)) {
    throw new Error(`grants is not an array: ${JSON.stringify(result).slice(0, 200)}`);
  }
  for (const g of result.grants) {
    if (!g || typeof g.keyword !== "string") {
      throw new Error(`grant.keyword missing: ${JSON.stringify(g).slice(0, 200)}`);
    }
    if (!Array.isArray(g.units)) {
      throw new Error(`grant.units not an array: ${JSON.stringify(g).slice(0, 200)}`);
    }
    if (g.units.some((x) => typeof x !== "string" || x.length <= 1)) {
      throw new Error(
        `Corrupted units (single-character entries): ${JSON.stringify(g.units).slice(0, 200)}`
      );
    }
  }
}
