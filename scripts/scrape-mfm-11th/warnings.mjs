import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const WARNINGS_PATH = resolve(CACHE_DIR, "_warnings.json");

// Categories used across the scrape pipeline. Listing them here is the source
// of truth for the audit script and any human grepping the file.
export const WARNING_CATEGORIES = [
  "pdf-url-missing", // discovery couldn't find a PDF for a slug
  "pdf-url-unclassified", // a PDF anchor whose label didn't map to a slug
  "pdf-fetch-failed", // exception during fetch
  "pdf-parse-failed", // exception during PDF-to-text extraction
  "mfm-missing-in-pdf", // MFM has this enhancement, PDF text doesn't (codex-only)
  "classifier-conditional", // LLM tagged body as a conditional "If your WARLORD…" clause
  "llm-call-failed", // API error after retries; this enhancement had no classification
  "llm-empty-response", // LLM returned tool call but with no usable restriction fields
  "llm-api-key-missing", // ANTHROPIC_API_KEY unset; LLM pass skipped wholesale
];

// Lightweight in-memory accumulator. Each script creates its own sink per
// run and flushes once at the end. The file is overwritten — there's no
// history, just "what happened in the last run."
export function createWarningSink(label) {
  const warnings = [];
  return {
    add(category, details = {}) {
      if (!WARNING_CATEGORIES.includes(category)) {
        // Catch typos at write time — silent drops would defeat the point.
        throw new Error(`Unknown warning category: ${category}`);
      }
      warnings.push({ category, ...details });
    },
    countsByCategory() {
      const counts = {};
      for (const w of warnings) counts[w.category] = (counts[w.category] ?? 0) + 1;
      return counts;
    },
    async flush() {
      if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true });
      const payload = {
        label,
        scrapedAt: new Date().toISOString(),
        counts: this.countsByCategory(),
        warnings,
      };
      await writeFile(WARNINGS_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
      return payload;
    },
  };
}

export { WARNINGS_PATH };
