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

import { enhancementNameKey } from "../scrape-mfm-11th/name-key.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const CACHE_PATH = resolve(CACHE_DIR, "llm-keyword-classifications.json");

// Same-faction datasheets whose name is a strict SUPERSTRING of the target's
// (e.g. target "CAPTAIN" → ["CAPTAIN ON BIKE", "CAPTAIN IN TERMINATOR ARMOUR"]).
// The disambiguation is intentionally asymmetric: a short BASE datasheet (often
// codex-resident with no block of its own) needs to be told about its longer
// variants — whose blocks all carry the generic "Captain" keyword — so it returns
// notFound instead of borrowing one. A long variant has a distinct heading and
// needs no such help, so we never feed it its own base name (which previously
// confused the LLM into dropping legit variants like "Captain on Bike"). Pure
// function — unit-tested.
export function deriveConfusableSiblings(targetName, siblingNames) {
  const kt = enhancementNameKey(targetName);
  if (!kt) return [];
  return [...siblingNames].filter((s) => {
    const ks = enhancementNameKey(s);
    return ks && ks !== kt && ks.includes(kt);
  });
}

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
- Extract the KEYWORDS line of the stat block whose HEADING (the ALL-CAPS title at the top of the stat block) is EXACTLY the target name. A datasheet's name also appears as a keyword inside its own block and inside related datasheets' blocks — match on the HEADING, not on a keyword.
- The user message may list "Other, longer-named datasheets" — these are DIFFERENT datasheets (e.g. target "CAPTAIN" vs "CAPTAIN ON BIKE") whose blocks carry the target's name as a generic keyword. If the only stat block(s) present are headed by one of those longer names (no block headed EXACTLY the target), set notFound: true — do NOT borrow their KEYWORDS line. (This does not apply when a block IS headed exactly the target: extract it normally even though its keywords include the shared term.)
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

function makeCacheKey({ datasheetName, pageTexts, confusableSiblings = [] }) {
  const h = createHash("sha256");
  h.update("v3:"); // bumped when the sibling-disambiguation prompt landed
  h.update(MODEL_ID);
  h.update("\0");
  h.update(datasheetName);
  h.update("\0");
  // Sibling set affects the prompt, so it must affect the key. Sort for
  // stability (the set's order is irrelevant to the result).
  h.update([...confusableSiblings].sort().join("|"));
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
//
// `siblingDatasheetNames` is the upper-cased set of every OTHER datasheet name
// in this faction. Used to detect cross-datasheet leakage in the LLM response
// (Haiku occasionally pulls a neighbour's stat block when two are flattened
// onto the same PDF page, returning the neighbour's keyword set verbatim). If
// the returned keywords list contains a sibling name, the whole response is
// treated as suspect (`notFound: true`) — partial scrubs leave the other
// hallucinated keywords (CHARACTER, CRYPTEK, …) in place, which is worse than
// dropping the entry and falling back to BSData. Applied to BOTH cache hits
// and fresh API responses so reusing the existing cache cleans existing leaks.
export async function classifyKeywordsWithLLM({
  client,
  datasheetName,
  pageTexts,
  factionName,
  siblingDatasheetNames,
  confusableSiblings = [],
}) {
  const cache = await getCache();
  const key = makeCacheKey({ datasheetName, pageTexts, confusableSiblings });
  if (cache[key]) {
    const filtered = filterLeakage(cache[key].response, siblingDatasheetNames);
    return { result: filtered.result, cacheHit: true, leaked: filtered.leaked };
  }

  // Cache-only mode for re-running the keyword pass over an existing cache
  // without paying for fresh LLM calls (e.g. when scrubbing a known data
  // quality issue from already-cached responses).
  if (process.env.MFM_SCRAPE_CACHE_ONLY === "1") {
    throw new Error(`cache-only mode: no cached response for ${datasheetName}`);
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
          `Datasheet (extract the block titled EXACTLY this): ${datasheetName}\n\n` +
          (confusableSiblings.length
            ? `Other, longer-named datasheets (different units that carry this ` +
              `name as a generic keyword — do NOT extract these; if no block is ` +
              `headed EXACTLY "${datasheetName}", return notFound): ` +
              `${confusableSiblings.join(", ")}\n\n`
            : "") +
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

  const filtered = filterLeakage(normalized, siblingDatasheetNames);
  return { result: filtered.result, cacheHit: false, leaked: filtered.leaked };
}

// Detects the "neighbour stat block" leak signature: the LLM returned at least
// one sibling datasheet's name as a keyword. When that happens the rest of
// the keyword set is almost always copied from that sibling too, so we drop
// the entry entirely (notFound) rather than try to partial-scrub.
function filterLeakage(response, siblingDatasheetNames) {
  if (!response || !(siblingDatasheetNames instanceof Set) || siblingDatasheetNames.size === 0) {
    return { result: response, leaked: null };
  }
  const kw = response.keywords ?? [];
  const leaked = kw.filter((k) => siblingDatasheetNames.has(k));
  if (leaked.length === 0) {
    return { result: response, leaked: null };
  }
  return {
    result: { keywords: [], factionKeywords: [], notFound: true },
    leaked,
  };
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
