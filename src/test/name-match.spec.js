import { describe, it, expect } from "vitest";
import {
  normalizeString,
  nameEquals,
  nameInList,
  hasAllKeywords,
} from "../utils/name-match";

// Special characters are constructed from code points so this source stays
// pure-ASCII and the byte sequences are unambiguous.
const CURLY = String.fromCodePoint(0x2019); // right single quotation mark
const OSLASH = String.fromCodePoint(0xf8); // o with stroke
// "KAHL" with a circumflex-A, in both Unicode normal forms (genuinely different
// byte sequences that must normalize the same way).
const KAHL_NFC = "K" + String.fromCodePoint(0xc2) + "HL"; // precomposed A-circumflex
const KAHL_NFD = "KA" + String.fromCodePoint(0x302) + "HL"; // A + combining circumflex

describe("normalizeString", () => {
  it("returns empty string for undefined", () => {
    expect(normalizeString(undefined)).toBe("");
  });

  it("returns empty string for null", () => {
    expect(normalizeString(null)).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeString("")).toBe("");
  });

  it("uppercases and strips non-alphanumerics", () => {
    expect(normalizeString("Adepta Sororitas!")).toBe("ADEPTASORORITAS");
  });

  it("preserves digits", () => {
    expect(normalizeString("Mk 1.5 Marines")).toBe("MK15MARINES");
  });

  it("collapses punctuation, spaces, and hyphens", () => {
    expect(normalizeString("Space-Marines, V2")).toBe("SPACEMARINESV2");
  });

  it("reduces accented letters identically across NFC and NFD forms", () => {
    expect(KAHL_NFC).not.toBe(KAHL_NFD);
    expect(normalizeString(KAHL_NFC)).toBe(normalizeString(KAHL_NFD));
    expect(normalizeString(KAHL_NFC)).toBe("KAHL");
  });
});

describe("nameEquals", () => {
  it("returns false when first arg is falsy", () => {
    expect(nameEquals(null, "Captain")).toBe(false);
    expect(nameEquals(undefined, "Captain")).toBe(false);
    expect(nameEquals("", "Captain")).toBe(false);
  });

  it("returns false when second arg is falsy", () => {
    expect(nameEquals("Captain", null)).toBe(false);
    expect(nameEquals("Captain", undefined)).toBe(false);
    expect(nameEquals("Captain", "")).toBe(false);
  });

  it("returns true for matching names after normalization", () => {
    expect(nameEquals("Adepta Sororitas", "ADEPTA-SORORITAS")).toBe(true);
    expect(nameEquals("Space Marines", "spacemarines")).toBe(true);
  });

  it("returns false for genuinely different names", () => {
    expect(nameEquals("Necrons", "Aeldari")).toBe(false);
  });
});

describe("nameInList", () => {
  it("returns false for a non-array or falsy name", () => {
    expect(nameInList(null, "Captain")).toBe(false);
    expect(nameInList(["Captain"], null)).toBe(false);
  });

  it("matches a host name regardless of apostrophe / punctuation form", () => {
    // allowedHosts stored one way, host.name another — must still match.
    expect(
      nameInList([`VON RYAN${CURLY}S LEAPERS`], "Von Ryan's Leapers")
    ).toBe(true);
    expect(nameInList([`TL-4${OSLASH}9`], `tl 4${OSLASH}9`)).toBe(true);
  });

  it("matches accented names across NFC/NFD Unicode forms", () => {
    expect(nameInList([KAHL_NFC], KAHL_NFD)).toBe(true);
    expect(nameInList([KAHL_NFD], KAHL_NFC)).toBe(true);
  });

  it("returns false when no entry matches", () => {
    expect(nameInList(["CAPTAIN", "LIEUTENANT"], "Chaplain")).toBe(false);
  });
});

describe("hasAllKeywords", () => {
  it("returns false for empty needles", () => {
    expect(hasAllKeywords(new Set(["A"]), [])).toBe(false);
    expect(hasAllKeywords(new Set(["A"]), undefined)).toBe(false);
  });

  it("matches every required keyword under normalized comparison", () => {
    const host = new Set([
      "ADEPTUS ASTARTES",
      `VON RYAN${CURLY}S LEAPERS`,
      "INFANTRY",
    ]);
    expect(hasAllKeywords(host, ["VON RYAN'S LEAPERS"])).toBe(true);
    expect(hasAllKeywords(host, ["ADEPTUS ASTARTES", "INFANTRY"])).toBe(true);
  });

  it("accepts an array haystack as well as a Set", () => {
    expect(hasAllKeywords([`TL-4${OSLASH}9`], [`TL-4${OSLASH}9`])).toBe(true);
  });

  it("returns false when any required keyword is missing", () => {
    expect(hasAllKeywords(new Set(["INFANTRY"]), ["INFANTRY", "CHARACTER"])).toBe(
      false
    );
  });
});
