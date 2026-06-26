import { describe, it, expect } from "vitest";
import { deriveConfusableSiblings } from "./llm-classify-keywords.mjs";

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
