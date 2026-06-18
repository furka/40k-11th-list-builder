// Locate the section of the PDF text that describes a given enhancement.
// Returns { snippet } or null if the enhancement name never appears in the
// PDF — which is the legitimate "MFM has it, PDF doesn't" case (codex-only
// detachments) that the caller surfaces as a `mfm-missing-in-pdf` warning.
//
// Matching is done on the same normalized key used elsewhere (uppercase,
// alphanumeric-only) so unicode punctuation and (Aura)/(Upgrade) suffix drift
// don't block the match. We search a normalized view of the PDF text with a
// parallel "position map" that lets us translate normalized-index back to
// raw-text-index and slice the right window of the original text.
//
// Window strategy: the snippet starts at the match and extends forward until
// we hit either another all-caps "title-like" line or 800 characters. The
// LLM only reports what it can see for the named enhancement, so generous
// over-inclusion is safe; under-inclusion (missing the host phrase) is not.

import { enhancementNameKey } from "./name-key.mjs";

const MAX_SNIPPET_CHARS = 800;
// Run of 4+ uppercase letters (allowing internal spaces) ahead of the
// position — common shape for the NEXT enhancement title on the same page.
// Trips on faction-pack body text occasionally but the snippet is bounded
// by MAX_SNIPPET_CHARS anyway, so a false trim is only a few characters off.
const NEXT_TITLE_RE = /(?:[A-Z]{3,}\s+){1,5}[A-Z]{3,}/;

// Build a normalized version of the raw text plus a position map that
// translates each character of the normalized string back to its original
// raw-text index. Lets us match in the clean normalized space and then
// take the snippet from the messy original.
function buildNormalizedView(rawText) {
  let normalized = "";
  const positions = [];
  for (let i = 0; i < rawText.length; i++) {
    const c = rawText[i];
    const code = c.charCodeAt(0);
    let mapped = "";
    if (code >= 48 && code <= 57) mapped = c; // 0-9
    else if (code >= 65 && code <= 90) mapped = c; // A-Z
    else if (code >= 97 && code <= 122) mapped = c.toUpperCase(); // a-z
    // Everything else (unicode punctuation, spaces, hyphens) gets dropped.
    if (mapped) {
      normalized += mapped;
      positions.push(i);
    }
  }
  return { normalized, positions };
}

export function findEnhancementSection(rawText, enhancementName) {
  const key = enhancementNameKey(enhancementName);
  if (!key) return null;

  const { normalized, positions } = buildNormalizedView(rawText);
  const idx = normalized.indexOf(key);
  if (idx === -1) return null;

  const rawStart = positions[idx];
  const rawCeil = Math.min(rawStart + MAX_SNIPPET_CHARS, rawText.length);
  let snippet = rawText.slice(rawStart, rawCeil);

  // Try to trim at the next title-like break, so the LLM doesn't get the
  // start of the next enhancement appended to this one. Skip the first ~80
  // chars (the title itself is uppercase and would always self-match).
  const searchFrom = Math.min(80, snippet.length);
  const tail = snippet.slice(searchFrom);
  const nextMatch = tail.match(NEXT_TITLE_RE);
  if (nextMatch && nextMatch.index !== undefined) {
    snippet = snippet.slice(0, searchFrom + nextMatch.index);
  }
  return { snippet };
}
