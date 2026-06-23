// LLM-driven datasheet-keyword classifier. For each MFM datasheet, parse the
// "KEYWORDS:" and "FACTION KEYWORDS:" lines from its Faction Pack PDF section.
//
// Per-call contract:
//   in:  { datasheetName, pageTexts, factionName }
//   out: { keywords: string[], factionKeywords: string[], notFound: boolean }
//
// Output strings are UPPERCASE, deduped within each array. The caller unions
// the two arrays into the final datasheet keyword set.
//
// Same dual-cache pattern as llm-classify.mjs:
//   1. Anthropic prompt cache via cache_control on the system block.
//   2. Local content-hash cache at .cache/llm-keyword-classifications.json,
//      keyed by sha256(modelId + datasheetName + sectionText).

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const CACHE_PATH = resolve(CACHE_DIR, "llm-keyword-classifications.json");

const MODEL_ID = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You read one or more raw text pages from a Warhammer 40k Faction Pack PDF, locate the section that DEFINES a named datasheet, and extract its keyword lines by calling the set_datasheet_keywords tool.

Each datasheet section in a Faction Pack ends with two structured lines, almost always on the same row of flattened PDF text:

  KEYWORDS: <comma-separated list of unit-level keywords>
  FACTION KEYWORDS: <comma-separated list of faction-level keywords>

Examples (verbatim from real PDFs):
  KEYWORDS: Beasts, Fly, Canoptek, Macrocytes FACTION KEYWORDS: Necrons
  KEYWORDS: Monster, Character, Epic Hero, Fly, C'tan Shard of the Nightbringer FACTION KEYWORDS: Necrons
  KEYWORDS: Infantry, Character, Epic Hero, Imperium, Adeptus Astartes FACTION KEYWORDS: Ultramarines

Rules:
- Output UPPERCASE versions of every keyword you find.
- Do NOT include weapon-level keywords (Anti-Vehicle, Twin-Linked, Lance, Sustained Hits, etc.). Those appear inside weapon ability brackets and are not datasheet keywords.
- The pages may also contain other datasheets, stratagems, or rules that mention the target datasheet's name in passing. Use only the KEYWORDS line of the section that DEFINES the target datasheet (its stat block heading appears in ALL CAPS, followed by M/T/SV/W/LD/OC stats).
- A single datasheet can span multiple variants (e.g. CHAOS LORD vs CHAOS LORD WITH JUMP PACK). Match on the EXACT datasheet name given to you and extract only THAT variant's KEYWORDS line.
- If the pages do not contain the target datasheet's stat block (only stratagem references, lore text, or cross-mentions), set notFound: true and leave the arrays empty.
- Do not invent keywords. Do not synonym-expand. Emit exactly what the KEYWORDS / FACTION KEYWORDS lines say.`;

const KEYWORD_TOOL = {
  name: "set_datasheet_keywords",
  description:
    "Record the datasheet-level and faction-level keywords parsed from the named datasheet's section.",
  input_schema: {
    type: "object",
    properties: {
      keywords: {
        type: "array",
        items: { type: "string" },
        description:
          "Unit-level KEYWORDS line, uppercased. Empty if not present.",
      },
      factionKeywords: {
        type: "array",
        items: { type: "string" },
        description:
          "FACTION KEYWORDS line, uppercased. Empty if not present.",
      },
      notFound: {
        type: "boolean",
        description:
          "True when the datasheet's stat block is not in the supplied pages (only passing mentions).",
      },
    },
    required: ["keywords", "factionKeywords", "notFound"],
  },
};

function makeCacheKey({ datasheetName, pageTexts }) {
  const h = createHash("sha256");
  h.update(MODEL_ID);
  h.update("\0");
  h.update(datasheetName);
  h.update("\0");
  // Page order is meaningful (reflects the PDF) so don't sort here.
  for (const p of pageTexts) {
    h.update(p);
    h.update("\0");
  }
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

export async function flushKeywordCache() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!pendingFlush) return;
  pendingFlush = false;
  const cache = await getCache();
  await saveCache(cache);
}

// Sequential per-faction calls share the cache-controlled system block (faction
// name in the cached header) so the Anthropic ephemeral cache fires for the
// 2nd+ datasheet in the same faction.
export async function classifyKeywordsWithLLM({
  client,
  datasheetName,
  pageTexts,
  factionName,
}) {
  const cache = await getCache();
  const key = makeCacheKey({ datasheetName, pageTexts });
  if (cache[key]) {
    return { result: cache[key].response, cacheHit: true };
  }

  const pagesBody = pageTexts
    .map((p, i) => `--- PAGE ${i + 1} ---\n${p}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 512,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      {
        type: "text",
        text: `Faction: ${factionName}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [KEYWORD_TOOL],
    tool_choice: { type: "tool", name: KEYWORD_TOOL.name },
    messages: [
      {
        role: "user",
        content:
          `Datasheet: ${datasheetName}\n\n` +
          `Faction Pack PDF pages that mention this name ` +
          `(${pageTexts.length} page${pageTexts.length === 1 ? "" : "s"}):\n\n` +
          pagesBody,
      },
    ],
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock) {
    throw new Error(
      `Model did not call the keyword tool (stop_reason=${response.stop_reason})`
    );
  }
  const raw = toolBlock.input;
  const normalized = normalizeResult(raw);

  cache[key] = {
    response: normalized,
    modelId: MODEL_ID,
    classifiedAt: new Date().toISOString(),
  };
  scheduleFlush(cache);

  return { result: normalized, cacheHit: false };
}

function normalizeResult(raw) {
  return {
    keywords: dedupeUppercase(raw?.keywords),
    factionKeywords: dedupeUppercase(raw?.factionKeywords),
    notFound: Boolean(raw?.notFound),
  };
}

function dedupeUppercase(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    const upper = trimmed.toUpperCase();
    if (seen.has(upper)) continue;
    seen.add(upper);
    out.push(upper);
  }
  return out;
}
