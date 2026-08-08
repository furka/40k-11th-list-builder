// The verdict step: one claude-sonnet-4-6 call that cross-references OUR usage
// of the package against WHAT changed between versions, returning a structured
// verdict via tool-use. Mirrors the SDK/tool/cache conventions in
// scripts/scrape-faction-pack-11th/llm-classify.mjs.

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const CACHE_PATH = resolve(CACHE_DIR, "verdicts.json");

// Sonnet, not Haiku (the scrapers' model): breaking-change reasoning is subtle
// and volume is one call per dependency PR, so quality wins over cost here.
export const MODEL_ID = "claude-sonnet-4-6";

// Bump when the prompt/schema change enough that old cached verdicts shouldn't
// be reused.
const VERDICT_CACHE_VERSION = "v1";

const SYSTEM_PROMPT = `You are a senior front-end engineer reviewing a Dependabot dependency bump for a Vue 3 single-page app (the "40k 11th list builder"). Your job is to judge whether upgrading this package from the old version to the new version could BREAK THE DEPLOYED APP, given the specific APIs this codebase actually imports.

You are given:
- the package name and the old -> new version,
- the semver update type (patch / minor / major),
- the "blast radius" (deployed = ships to users, or unknown),
- the exact symbols/APIs our code imports from this package and where,
- release notes and/or the list of files the package changed between these versions.

Reason about INTERSECTION: does anything that changed in this version touch an API we actually use, in a way that changes behavior, signatures, defaults, or removes something? Ignore changes to parts of the package we never import.

Call the record_dep_verdict tool exactly once:
- verdict "safe": changes clearly do not affect the APIs we use (e.g. patch fixes to unrelated features, or additive-only changes).
- verdict "review": plausible but unconfirmed impact, a major bump touching our surface, or you lack enough changelog detail to be confident. This is the correct default when uncertain.
- verdict "risky": a documented breaking change or removal plausibly hits code we import.

Be concrete and specific to THIS codebase's usage. Do not invent breaking changes the notes don't support. In "summary" write 2-4 sentences of plain-language reasoning suitable for a PR comment (GitHub markdown allowed). Populate affectedUsages only for files whose imported symbols are genuinely implicated. recommendedManualChecks should be short, concrete things a human could click through in the running app.`;

const VERDICT_TOOL = {
  name: "record_dep_verdict",
  description: "Record the structured dependency-update review verdict.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["safe", "review", "risky"] },
      confidence: { type: "number" },
      affectedUsages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            file: { type: "string" },
            symbol: { type: "string" },
            reason: { type: "string" },
          },
          required: ["file", "symbol", "reason"],
        },
      },
      relevantBreakingChanges: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
      recommendedManualChecks: { type: "array", items: { type: "string" } },
    },
    required: [
      "verdict",
      "confidence",
      "affectedUsages",
      "relevantBreakingChanges",
      "summary",
      "recommendedManualChecks",
    ],
  },
};

function makeCacheKey(input) {
  const h = createHash("sha256");
  h.update(`${VERDICT_CACHE_VERSION}:`);
  h.update(MODEL_ID);
  h.update("\0");
  h.update(JSON.stringify(input));
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

function buildUserContent({ packageName, from, to, updateType, blastRadius, usage, changes }) {
  const lines = [];
  lines.push(`Package: ${packageName}`);
  lines.push(`Version: ${from} -> ${to}`);
  lines.push(`Update type: ${updateType || "unknown"}`);
  lines.push(`Blast radius: ${blastRadius}`);
  lines.push("");

  lines.push("=== APIs this codebase imports from the package ===");
  lines.push(usage.symbols.length ? usage.symbols.join(", ") : "(none detected via import scan)");
  lines.push("");
  lines.push("Import sites:");
  for (const site of usage.sites.slice(0, 40)) {
    lines.push(`- ${site.file}:${site.line}\n    ${site.snippet}`);
  }
  lines.push("");

  lines.push("=== What changed between these versions ===");
  if (changes.repoSlug) lines.push(`Source repo: ${changes.repoSlug}`);
  if (changes.releaseNotes.length) {
    lines.push("Release notes (old, new]:");
    for (const note of changes.releaseNotes) {
      lines.push(`\n## ${note.name} (${note.tag})\n${note.body || "(no body)"}`);
    }
  } else {
    lines.push("Release notes: none found.");
  }
  lines.push("");
  if (changes.changedFiles?.length) {
    lines.push("Files changed inside the package (npm diff):");
    lines.push(changes.changedFiles.slice(0, 200).join("\n"));
  } else {
    lines.push("Package file diff: unavailable.");
  }
  if (changes.warnings?.length) {
    lines.push("");
    lines.push("Data-collection caveats: " + changes.warnings.join(" | "));
  }
  return lines.join("\n");
}

export async function analyzeUpdate(params) {
  const cacheInput = {
    packageName: params.packageName,
    from: params.from,
    to: params.to,
    updateType: params.updateType,
    blastRadius: params.blastRadius,
    symbols: params.usage.symbols,
    releaseTags: params.changes.releaseNotes.map((n) => n.tag),
    changedFiles: params.changes.changedFiles,
  };
  const key = makeCacheKey(cacheInput);
  const cache = await loadCache();
  if (cache[key]) return { verdict: cache[key].verdict, cacheHit: true };

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 2048,
    temperature: 0,
    system: SYSTEM_PROMPT,
    tools: [VERDICT_TOOL],
    tool_choice: { type: "tool", name: VERDICT_TOOL.name },
    messages: [{ role: "user", content: buildUserContent(params) }],
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock) {
    throw new Error(
      `Model did not call the verdict tool (stop_reason=${response.stop_reason})`
    );
  }
  const verdict = toolBlock.input;

  cache[key] = { verdict, modelId: MODEL_ID, reviewedAt: new Date().toISOString() };
  await saveCache(cache);

  return { verdict, cacheHit: false };
}
