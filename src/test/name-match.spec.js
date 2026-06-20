import { describe, it, expect } from "vitest";
import { normalizeString, nameEquals } from "../utils/name-match";

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
