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

// Locate the page(s) describing a detachment's rules section in the Faction
// Pack PDF. Two anchors are accepted:
//
//   1. "{NAME} DETACHMENT RULES" — the canonical heading for a detachment's
//      main rules section.
//   2. "{NAME} DETACHMENT" + "Keywords Section Change" on the same page —
//      the errata pattern used in "Rules Updates" sections (e.g. CSM Chaos
//      Cult, DA Company of Hunters). The change-to phrase is specific
//      enough that false positives are unlikely; pages with multiple
//      errata entries are included for every named detachment, and the LLM
//      is told to extract only the rule for the detachment it's asked about.
//
// Over-includes: a page with either anchor gets through and the LLM decides
// whether any keyword-grant rules are present. Returns { pages: string[] }
// or null.
// Filter Faction Pack PDF pages down to those that mention the named
// datasheet. Used by the keyword classifier to scope the LLM's reading
// window. Returns null when the datasheet's name doesn't appear anywhere in
// the PDF — the EXPECTED case for any unit whose datasheet was stripped
// from the PDF when its codex shipped (the codex becomes the source of
// truth; the PDF only carries post-codex additions and errata).
//
// Same over-include posture as findEnhancementPages: a page that mentions
// the datasheet only as a leader.attachesTo reference, stratagem trigger,
// or enhancement host still gets through. The LLM is told to extract only
// from the actual stat block and return `notFound: true` when only
// cross-references are present.
export function findDatasheetPages(pages, datasheetName) {
  const key = enhancementNameKey(datasheetName);
  if (!key) return null;
  const matches = pages.filter((p) => normalize(p).includes(key));
  if (matches.length === 0) return null;
  return { pages: matches };
}

export function findDetachmentRulesPages(pages, detachmentName) {
  const key = enhancementNameKey(detachmentName);
  if (!key) return null;
  const detachmentRulesAnchor = key + "DETACHMENTRULES";
  const detachmentAnchor = key + "DETACHMENT";
  const errataMarker = "KEYWORDSSECTIONCHANGE";
  const matches = pages.filter((p) => {
    const n = normalize(p);
    if (n.includes(detachmentRulesAnchor)) return true;
    if (n.includes(detachmentAnchor) && n.includes(errataMarker)) return true;
    return false;
  });
  if (matches.length === 0) return null;
  return { pages: matches };
}
