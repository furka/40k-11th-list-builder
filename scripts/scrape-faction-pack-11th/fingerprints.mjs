// Per-faction fingerprint gate for the Faction Pack PDF scrape.
//
// The four PDF passes already cache each LLM response by content hash, so an
// unchanged datasheet costs ZERO tokens — but that cache lives in gitignored
// .cache/ and only survives across CI runs via an ephemeral GitHub Actions
// cache. When that cache is evicted (7-day idle / repo LRU) a run re-classifies
// the ENTIRE corpus even though no PDF changed.
//
// This module adds a durable, git-committed fingerprint (faction-pack-
// fingerprints.json) so the scrape can skip a faction outright — no PDF parse,
// no LLM call — when its rules text is unchanged since the last successful run.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pdfToPages } from "./pdf-to-text.mjs";
import { MODEL_ID, RESTRICTION_CACHE_VERSION } from "./llm-classify.mjs";
import { KEYWORD_CACHE_VERSION } from "./llm-classify-keywords.mjs";
import { GRANTS_CACHE_VERSION } from "./llm-classify-detachment-grants.mjs";
import { ERRATA_CACHE_VERSION } from "./llm-classify-errata-keywords.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FINGERPRINTS_PATH = resolve(__dirname, "faction-pack-fingerprints.json");

// Bump when the fingerprint scheme itself changes (hash input or manifest shape).
const FINGERPRINT_SCHEME = "fp1";

// A single token that changes whenever ANY pass's prompt/version or the model
// changes, mirroring the per-entity makeCacheKey versions up at the coarse skip
// gate. A classifier improvement (e.g. the v3→v4 keyword-splitting fix) bumps
// one of these constants, which flips every faction's stored `rev` mismatch and
// forces a full re-run — so prompt fixes still propagate to every faction.
export function classifierRevision() {
  return [
    FINGERPRINT_SCHEME,
    MODEL_ID,
    KEYWORD_CACHE_VERSION,
    RESTRICTION_CACHE_VERSION,
    GRANTS_CACHE_VERSION,
    ERRATA_CACHE_VERSION,
  ].join("|");
}

// Fingerprint the EXTRACTED TEXT, not the PDF bytes: GW re-exports packs with
// fresh internal metadata even when the rules text is identical, so a binary
// hash would churn on every upload. Page order is meaningful (it reflects the
// PDF), so join without sorting.
export async function computeFactionTextHash(pdfBuffer) {
  const pages = await pdfToPages(pdfBuffer);
  return hashPageText(pages);
}

export function hashPageText(pages) {
  const h = createHash("sha256");
  h.update(pages.join("\f"));
  return h.digest("hex");
}

// A faction is safe to skip only when BOTH its extracted-text hash and the
// classifier revision match what produced the committed output.
export function isUnchanged(entry, textHash, rev = classifierRevision()) {
  return !!entry && entry.textHash === textHash && entry.rev === rev;
}

export async function loadFingerprints() {
  if (!existsSync(FINGERPRINTS_PATH)) return {};
  try {
    return JSON.parse(await readFile(FINGERPRINTS_PATH, "utf8"));
  } catch {
    return {};
  }
}

// Stable, sorted output (slug keys sorted) so the committed manifest only
// changes when a fingerprint actually changes — never on key reordering.
export async function saveFingerprints(manifest) {
  const out = { _rev: classifierRevision() };
  for (const slug of Object.keys(manifest).filter((k) => !k.startsWith("_")).sort()) {
    out[slug] = manifest[slug];
  }
  await mkdir(dirname(FINGERPRINTS_PATH), { recursive: true });
  await writeFile(FINGERPRINTS_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
}

export { FINGERPRINTS_PATH };
