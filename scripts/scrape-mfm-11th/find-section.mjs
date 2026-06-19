// Filter Faction Pack PDF pages down to just the ones that mention a given
// enhancement name. Returns { pages: string[] } or null when no page contains
// the name — the legitimate "MFM has it, PDF doesn't" case (codex-only
// detachments) that the caller surfaces as a `mfm-missing-in-pdf` warning.
//
// Matching is done on the same normalized key used elsewhere (uppercase,
// alphanumeric-only) so unicode punctuation, casing, and (Aura)/(Upgrade)
// suffix drift don't block the match. We intentionally over-include here —
// a page that mentions the name in a stratagem cross-reference but doesn't
// actually DEFINE the enhancement is still passed to the LLM, which is told
// to recognise that case and return `notDefined: true`.

import { enhancementNameKey } from "./name-key.mjs";

function normalize(s) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function findEnhancementPages(pages, enhancementName) {
  const key = enhancementNameKey(enhancementName);
  if (!key) return null;
  const matches = pages.filter((p) => normalize(p).includes(key));
  if (matches.length === 0) return null;
  return { pages: matches };
}
