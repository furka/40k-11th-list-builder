// Canonical key for matching enhancement names between the PDF (Faction Pack)
// and the MFM scrape. Both sides go through this same function so that:
//
//   - Trailing parenthetical tags ("(Aura)", "(Upgrade)", "(AURA)") don't
//     break the lookup when one side preserves them and the other strips
//     them. The MFM scrape, for historical reasons, strips "(Upgrade)" but
//     keeps "(Aura)" — this helper papers over that inconsistency.
//
//   - Unicode punctuation differences ('Ravensky' vs 'Ravensky' (U+2019)
//     curly apostrophe, '-' vs '‑' non-breaking hyphen, accented letters
//     like 'â') stop blocking the match. Mirrors `normalizeString()` in
//     src/utils/name-match.js — inlined here so this Node-only scrape
//     script doesn't import the runtime Vue subgraph. Keep the two
//     implementations in sync.
export function enhancementNameKey(rawName) {
  if (!rawName) return "";
  const noParens = String(rawName).replace(/\s*\([^)]*\)\s*$/, "");
  return noParens.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
