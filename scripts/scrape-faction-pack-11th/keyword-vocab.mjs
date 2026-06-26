// Build the closed keyword vocabulary the enhancement-restrictions scraper
// passes to the LLM so it can't invent multi-token concatenations as a single
// requiredKeywords string (e.g. "ADEPTUS CUSTODES WALKER" — must be split into
// the atomic ["ADEPTUS CUSTODES", "WALKER"]).
//
// Sources are the same three layers that power KEYWORDS_BY_FACTION in
// src/data/keywords/index.js, read fresh from disk each call so the
// scraper's pass-reorder picks up the just-written faction-pack-keywords.auto.json.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KW_DIR = resolve(__dirname, "../../src/data/keywords");

function loadLayer(file) {
  try {
    return JSON.parse(readFileSync(resolve(KW_DIR, file), "utf8"));
  } catch {
    return {};
  }
}

export function buildKeywordVocab() {
  const perFaction = new Map();
  const global = new Set();
  const layers = [
    loadLayer("bsdata-keywords.auto.json"),
    loadLayer("faction-pack-keywords.auto.json"),
    loadLayer("manual-overrides.json"),
  ];
  for (const layer of layers) {
    for (const [faction, sheets] of Object.entries(layer)) {
      if (faction.startsWith("_") || !sheets || typeof sheets !== "object") continue;
      let f = perFaction.get(faction);
      if (!f) perFaction.set(faction, (f = new Set()));
      for (const kws of Object.values(sheets)) {
        if (!Array.isArray(kws)) continue;
        for (const k of kws) {
          f.add(k);
          global.add(k);
        }
      }
    }
  }
  return { perFaction, global };
}

// Greedy longest-match decomposition of a candidate string against the
// global vocab. Returns an array of atomic vocab tokens if the candidate
// tiles exactly, or null if some leftover bytes don't match anything.
//
// Example: splitAgainstVocab("ADEPTUS CUSTODES WALKER", vocab) →
// ["ADEPTUS CUSTODES", "WALKER"] when both atoms are in the vocab.
export function splitAgainstVocab(candidate, globalVocab) {
  if (typeof candidate !== "string" || !candidate) return null;
  if (globalVocab.has(candidate)) return [candidate];
  const sortedVocab = [...globalVocab].sort((a, b) => b.length - a.length);
  const pieces = [];
  let rest = candidate.trim();
  while (rest.length) {
    let best = null;
    for (const v of sortedVocab) {
      if (rest === v || rest.startsWith(v + " ")) {
        if (!best || v.length > best.length) best = v;
      }
    }
    if (!best) return null;
    pieces.push(best);
    rest = rest.slice(best.length).trim();
  }
  return pieces.length > 0 ? pieces : null;
}
