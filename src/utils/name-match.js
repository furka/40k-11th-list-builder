export function normalizeString(str) {
  if (!str) return "";
  // NFD-decompose then drop combining marks so accented letters reduce to their
  // base letter CONSISTENTLY regardless of whether a source stored the
  // precomposed (NFC "Â") or decomposed (NFD "A"+◌̂) form — otherwise the two
  // would normalize differently ("KHL" vs "KAHL") and silently fail to match.
  // Remaining non-ASCII letters with no decomposition (e.g. "ø") are stripped;
  // that's fine because every comparison side goes through this same function.
  return str
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function nameEquals(name1, name2) {
  if (!name1 || !name2) return false;
  return normalizeString(name1) === normalizeString(name2);
}

// True if `name` matches any entry in `list` under normalized comparison.
// Used for enhancement `allowedHosts` checks so a host datasheet name resolves
// regardless of apostrophe / diacritic / punctuation form across data layers.
export function nameInList(list, name) {
  if (!Array.isArray(list) || !name) return false;
  const target = normalizeString(name);
  return list.some((n) => normalizeString(n) === target);
}

// True if every keyword in `needles` is present in `haystack` (a Set/array of
// keyword strings) under normalized comparison. Used for `requiredKeywords`
// matching so values like "VON RYAN'S LEAPERS" / "TL-4ø9" match regardless of
// the exact Unicode form stored in the host's keyword set.
export function hasAllKeywords(haystack, needles) {
  if (!Array.isArray(needles) || needles.length === 0) return false;
  const norm = new Set();
  for (const h of haystack ?? []) norm.add(normalizeString(h));
  return needles.every((n) => norm.has(normalizeString(n)));
}
