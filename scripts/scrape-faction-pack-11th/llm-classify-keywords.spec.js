import { describe, it, expect } from "vitest";
import {
  deriveConfusableSiblings,
  isKeywordBorrow,
} from "./llm-classify-keywords.mjs";

describe("deriveConfusableSiblings", () => {
  const SM = [
    "CAPTAIN ON BIKE",
    "CAPTAIN IN TERMINATOR ARMOUR",
    "LIEUTENANT",
    "CATO SICARIUS", // a named captain — name does NOT contain "Captain"
  ];

  it("returns same-faction names that SUPERSTRING the target (base → its variants)", () => {
    expect(deriveConfusableSiblings("CAPTAIN", SM)).toEqual([
      "CAPTAIN ON BIKE",
      "CAPTAIN IN TERMINATOR ARMOUR",
    ]);
  });

  it("is asymmetric: a long variant is NOT fed its own base name", () => {
    // "Captain on Bike" has a distinct heading and needs no disambiguation;
    // feeding it "CAPTAIN" previously made the LLM wrongly drop it.
    expect(deriveConfusableSiblings("CAPTAIN ON BIKE", ["CAPTAIN", "LIEUTENANT"])).toEqual(
      []
    );
  });

  it("returns [] when no name overlaps", () => {
    expect(deriveConfusableSiblings("LIEUTENANT", SM)).toEqual([]);
  });

  it("does not list a same-named (self) sibling", () => {
    expect(deriveConfusableSiblings("CAPTAIN", ["CAPTAIN", "CAPTAIN ON BIKE"])).toEqual([
      "CAPTAIN ON BIKE",
    ]);
  });

  it("is tolerant of casing/punctuation drift (normalized comparison)", () => {
    expect(deriveConfusableSiblings("captain", ["Captain on Bike"])).toEqual([
      "Captain on Bike",
    ]);
  });
});

describe("isKeywordBorrow", () => {
  // The real regression: Custodian Guard's stat block was stripped from the
  // pack, so the classifier extracted the spear-variant's KEYWORDS line and
  // swapped in the plain name — dropping BATTLELINE.
  const base = ["ADEPTUS CUSTODES", "CUSTODIAN GUARD", "IMPERIUM", "INFANTRY"];
  const variant = [
    "ADEPTUS CUSTODES",
    "CUSTODIAN GUARD WITH ADRASITE AND PYRITHITE SPEARS",
    "IMPERIUM",
    "INFANTRY",
  ];

  it("flags a base whose set is the variant's with only the self-name swapped", () => {
    expect(
      isKeywordBorrow(
        base,
        variant,
        "CUSTODIAN GUARD",
        "CUSTODIAN GUARD WITH ADRASITE AND PYRITHITE SPEARS"
      )
    ).toBe(true);
  });

  it("does NOT flag when the base carries a keyword the variant lacks (BATTLELINE)", () => {
    const genuineBase = [...base, "BATTLELINE"];
    expect(
      isKeywordBorrow(
        genuineBase,
        variant,
        "CUSTODIAN GUARD",
        "CUSTODIAN GUARD WITH ADRASITE AND PYRITHITE SPEARS"
      )
    ).toBe(false);
  });

  it("requires each name to appear as its own keyword", () => {
    // Base doesn't carry its own name → not the swap signature.
    expect(
      isKeywordBorrow(
        ["ADEPTUS CUSTODES", "IMPERIUM", "INFANTRY"],
        variant,
        "CUSTODIAN GUARD",
        "CUSTODIAN GUARD WITH ADRASITE AND PYRITHITE SPEARS"
      )
    ).toBe(false);
  });

  it("returns false when names are unrelated (not a superstring pair)", () => {
    expect(isKeywordBorrow(base, base, "CUSTODIAN GUARD", "CUSTODIAN GUARD")).toBe(
      false
    );
  });
});
