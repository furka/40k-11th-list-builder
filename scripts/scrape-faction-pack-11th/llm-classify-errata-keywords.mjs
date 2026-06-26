// LLM-driven errata keyword classifier. Faction Pack "Rules Updates" pages carry
// post-codex keyword corrections of the form:
//
//   "<datasheet, datasheet, …> – Keywords Section Add 'FRAME'."
//   "Warlock Conclave ▪ Keywords section: delete 'CHARACTER'."
//   "Corvus Blackstar ▪ Keywords: Remove 'AIRCRAFT'."
//
// These are authoritative deltas on a datasheet's keyword set and are exactly the
// kind of change the stat-block-gated keyword pass cannot see (codex-resident
// datasheets have no stat block in the pack). This pass reads the rules-update
// pages for a faction and returns, per datasheet, the keywords to add/remove.
//
// Same dual-cache pattern as the other classifiers (Anthropic ephemeral prompt
// cache + local content-hash cache).

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const CACHE_PATH = resolve(CACHE_DIR, "llm-errata-keyword-classifications.json");

const MODEL_ID = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You read the "Rules Updates" (errata) pages of a Warhammer 40k Faction Pack PDF and extract ONLY the datasheet keyword changes by calling the set_errata_keywords tool.

The errata you care about look like one of these forms (the datasheet name list precedes the change, and one entry can name several datasheets sharing the same change):

  Exorcist, Immolator, Sororitas Rhino – Keywords section Add the 'FRAME' keyword.
  Land Speeder Vengeance, Ravenwing Darkshroud, Sammael – Keywords Section Add 'FRAME'.
  Warlock Conclave ▪ Keywords section: delete 'CHARACTER'.
  Corvus Blackstar ▪ Keywords: Remove 'AIRCRAFT'.

Rules:
- Extract ONLY changes that come from a datasheet's "Keywords Section" / "Keywords:" line (the ones in the examples above).
- Emit one change object per distinct (datasheet, change) — if a single errata line lists several datasheets, list them ALL in that object's "datasheets" array.
- "datasheets" must be the datasheet names exactly as written in the errata (you will be given the faction's datasheet name list; prefer those spellings).
- "add" = keywords being ADDED (UPPERCASE). "remove" = keywords being DELETED/REMOVED (UPPERCASE).
- IGNORE every other kind of change, even if it looks keyword-like:
  • "Core Abilities" section changes such as Remove 'Leader' / add 'Support' / Remove 'Hover' — those are ABILITIES, not keywords. Do NOT emit them.
  • ability rewordings, points changes, weapon/profile (M/T/SV/W/OC) changes, detachment-rule changes, stratagem changes, FAQ answers.
  • "FACTION:" army-rule keyword changes, and detachment keyword grants ("X units gain the BATTLELINE keyword") — handled elsewhere.
- If the pages contain no datasheet "Keywords Section" changes, return changes: [] (do not invent any).`;

const ERRATA_TOOL = {
  name: "set_errata_keywords",
  description:
    "Record datasheet keyword add/remove changes parsed from the Rules Updates pages.",
  input_schema: {
    type: "object",
    properties: {
      changes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            datasheets: { type: "array", items: { type: "string" } },
            add: { type: "array", items: { type: "string" } },
            remove: { type: "array", items: { type: "string" } },
          },
          required: ["datasheets", "add", "remove"],
        },
      },
    },
    required: ["changes"],
  },
};

function makeCacheKey({ factionName, pageTexts }) {
  const h = createHash("sha256");
  h.update("errata-keywords:v1:");
  h.update(MODEL_ID);
  h.update("\0");
  h.update(SYSTEM_PROMPT);
  h.update("\0");
  h.update(factionName);
  h.update("\0");
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
    if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
  }, 500);
}

export async function flushErrataKeywordCache() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!pendingFlush) return;
  pendingFlush = false;
  const cache = await getCache();
  if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

export async function classifyErrataKeywordsWithLLM({
  client,
  factionName,
  pageTexts,
  datasheetNames,
}) {
  const cache = await getCache();
  const key = makeCacheKey({ factionName, pageTexts });
  if (cache[key]) return { result: cache[key].response, cacheHit: true };

  if (process.env.MFM_SCRAPE_CACHE_ONLY === "1") {
    throw new Error(`cache-only mode: no cached errata response for ${factionName}`);
  }

  const pagesBody = pageTexts
    .map((p, i) => `--- RULES UPDATE PAGE ${i + 1} ---\n${p}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 1024,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      {
        type: "text",
        text: `Faction: ${factionName}\nDatasheet names:\n${datasheetNames.join("\n")}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [ERRATA_TOOL],
    tool_choice: { type: "tool", name: ERRATA_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Rules Updates pages (${pageTexts.length}):\n\n${pagesBody}`,
      },
    ],
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock) {
    throw new Error(
      `Model did not call the errata tool (stop_reason=${response.stop_reason})`
    );
  }
  const normalized = normalizeResult(toolBlock.input);
  cache[key] = { response: normalized, modelId: MODEL_ID, classifiedAt: new Date().toISOString() };
  scheduleFlush(cache);
  return { result: normalized, cacheHit: false };
}

function dedupeUpper(arr) {
  const seen = new Set();
  const out = [];
  for (const v of Array.isArray(arr) ? arr : []) {
    if (typeof v !== "string") continue;
    const u = v.trim().toUpperCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function normalizeResult(raw) {
  const changes = [];
  for (const c of Array.isArray(raw?.changes) ? raw.changes : []) {
    const datasheets = (Array.isArray(c?.datasheets) ? c.datasheets : [])
      .filter((s) => typeof s === "string" && s.trim())
      .map((s) => s.trim());
    const add = dedupeUpper(c?.add);
    const remove = dedupeUpper(c?.remove);
    if (datasheets.length && (add.length || remove.length)) {
      changes.push({ datasheets, add, remove });
    }
  }
  return { changes };
}
