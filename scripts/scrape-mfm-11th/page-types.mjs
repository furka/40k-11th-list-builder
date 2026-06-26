// Classify each Faction Pack PDF page by its content type, so every pass only
// ever sees the pages it cares about (datasheet keywords ← datasheet pages,
// enhancement restrictions ← detachment pages, detachment grants ← detachment +
// rules-update pages). Routing by type before the per-entity name match removes
// the cross-type contamination that let the keyword classifier hallucinate from
// errata/detachment prose (the Land Speeder Vengeance bug).
//
// Classification is deterministic — verified across all 28 cached packs (1330 of
// 1343 pages typed, zero pages matching more than one type under this priority
// order; the ~13 "other" pages are faction army-rule intros, Legends armoury
// lists, and blanks, which no pass needs).

import { pageHasStatBlock } from "./find-section.mjs";

export const PAGE_TYPE = {
  DATASHEET: "datasheet",
  DETACHMENT: "detachment",
  RULES_UPDATE: "rulesUpdate",
  OTHER: "other",
};

// Errata pages routinely mention "Stratagem"/"Detachment" in their change text,
// so rules-update markers MUST be checked before the detachment markers or those
// pages would be mis-typed. Datasheet stat blocks are checked first and never
// carry the other markers.
const RULES_UPDATE_RE =
  /RULES UPDATES|FAQS|Keywords Section|Profiles?\s+Change to|Ability\s+Change to/i;
const DETACHMENT_RE = /DETACHMENT RULES?|STRATAGEM|ENHANCEMENTS/i;

export function classifyPage(text) {
  if (!text) return PAGE_TYPE.OTHER;
  if (pageHasStatBlock(text)) return PAGE_TYPE.DATASHEET;
  if (RULES_UPDATE_RE.test(text)) return PAGE_TYPE.RULES_UPDATE;
  if (DETACHMENT_RE.test(text)) return PAGE_TYPE.DETACHMENT;
  return PAGE_TYPE.OTHER;
}

// Return the subset of page texts (original order preserved) whose type is one of
// `types`. Used to scope a pass's reading window before the per-entity name match.
export function filterPagesByType(pages, ...types) {
  const wanted = new Set(types);
  return pages.filter((p) => wanted.has(classifyPage(p)));
}
