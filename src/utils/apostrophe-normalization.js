// Canonicalize apostrophe-like unicode codepoints to a single form so byte-
// exact name comparisons across our data layers (MFM JSON ↔ allowedHosts ↔
// validator) don't silently desync.
//
// Canonical form is U+2019 RIGHT SINGLE QUOTATION MARK — the typographic
// standard GW uses in printed text and what most of our scraped data already
// carries. The variants we collapse:
//
//   U+0027 APOSTROPHE                       (ASCII straight ')
//   U+2018 LEFT SINGLE QUOTATION MARK       (leading curly ')
//   U+2019 RIGHT SINGLE QUOTATION MARK      (canonical ')
//   U+02BC MODIFIER LETTER APOSTROPHE       (used in some transliterations)
//   U+02BB MODIFIER LETTER TURNED COMMA     (sometimes used for ʻokina-style names)
//
// Importable from both the Vue runtime and the Node scrape scripts. The
// scripts use ES modules (*.mjs) and can `import` files under src/ directly —
// the existing pattern in scripts/scrape-mfm-11th/keyword-vocab.mjs already
// imports from src/data/keywords.

const CANONICAL = "’";
const APOSTROPHE_VARIANTS = /['‘’ʼʻ]/g;

export function normalizeApostrophes(s) {
  if (typeof s !== "string") return s;
  return s.replace(APOSTROPHE_VARIANTS, CANONICAL);
}

// Walk an object/array recursively, normalizing every string leaf. Returns a
// new structure (doesn't mutate the input) — JSON-serializable shapes only.
// Object keys ARE normalized too: enhancement-restrictions JSON is keyed by
// enhancement name, and that key needs the same canonicalization as values.
export function normalizeApostrophesDeep(value) {
  if (typeof value === "string") return normalizeApostrophes(value);
  if (Array.isArray(value)) return value.map(normalizeApostrophesDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[normalizeApostrophes(k)] = normalizeApostrophesDeep(v);
    }
    return out;
  }
  return value;
}
