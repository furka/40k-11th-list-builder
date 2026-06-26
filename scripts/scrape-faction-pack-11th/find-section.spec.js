import { describe, it, expect } from "vitest";
import { pageHasStatBlock } from "./find-section.mjs";

describe("pageHasStatBlock", () => {
  it("returns true for a real datasheet stat block (has a FACTION KEYWORDS line)", () => {
    // Verbatim shape of the Ravenwing Talonmaster section from the DA pack.
    const page =
      "RAVENWING TALONMASTER M T SV W LD OC ... " +
      "KEYWORDS: Vehicle, Character, Fly, Frame, Imperium, Ravenwing, Ravenwing Talonmaster " +
      "FACTION KEYWORDS: Adeptus Astartes, Dark Angels ABILITIES CORE: Deadly Demise 1";
    expect(pageHasStatBlock(page)).toBe(true);
  });

  it("returns false for the Land Speeder Vengeance errata page (the bug)", () => {
    // p10 of the DA pack: only an errata mention, no stat block.
    const page =
      "Sammael, Grand Master of the Ravenwing Ability Change to: '...' " +
      "Land Speeder Vengeance, Ravenwing Darkshroud, Sammael – Keywords Section Add ' FRAME '. " +
      "FAQS Q: ... A: No.";
    expect(pageHasStatBlock(page)).toBe(false);
  });

  it("returns false for detachment-rules / stratagem prose mentioning the unit", () => {
    // p3 of the DA pack: detachment + enhancement text, no stat block.
    const page =
      "DARKFLIGHT PURSUIT DETACHMENT RULES ... NIGHTFORGED BATTERY UPGRADE ... " +
      "LAND SPEEDER VENGEANCE unit only. This unit can re-roll ...";
    expect(pageHasStatBlock(page)).toBe(false);
  });

  it("a 'gain the BATTLELINE keyword' rules-update mention is not a stat block", () => {
    const page =
      "Keywords Section Change to ' OUTRIDER SQUAD units from your army gain the BATTLELINE keyword.'";
    expect(pageHasStatBlock(page)).toBe(false);
  });
});
