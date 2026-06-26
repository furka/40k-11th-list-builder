import { describe, it, expect } from "vitest";
import { PAGE_TYPE, classifyPage, filterPagesByType } from "./page-types.mjs";

// Sample strings mirror the flattened-text shapes seen in the real packs.
const DATASHEET =
  "RAVENWING TALONMASTER M T SV W LD OC ... KEYWORDS: Vehicle, Character, Fly, " +
  "Frame, Ravenwing, Ravenwing Talonmaster FACTION KEYWORDS: Adeptus Astartes, Dark Angels";
const DETACHMENT_RULES =
  "DARKFLIGHT PURSUIT DETACHMENT RULES BLACK-WINGED VIGILANCE ... ENHANCEMENTS " +
  "THUNDERCOWL TURBINES UPGRADE ... SKYBORNE SURVEILLANCE 1CP DARKFLIGHT PURSUIT STRATAGEM";
const DETACHMENT_STRATAGEM_PAGE =
  "SHIELD OF DENIAL CHAMPIONS OF FAITH – BATTLE TACTIC STRATAGEM With so ...";
const DETACHMENT_RULE_SINGULAR =
  "DEATHWATCH – BLACK SPEAR TASK FORCE DETACHMENT RULE If your Army Faction is ...";
const RULES_UPDATE =
  "DARK ANGELS RULES UPDATES ... Land Speeder Vengeance, Ravenwing Darkshroud, " +
  "Sammael – Keywords Section Add ' FRAME '. FAQS Q: ... A: No.";
const RULES_UPDATE_WITH_STRATAGEM =
  "DARK ANGELS RULES UPDATES ... Relic Teleportarium Stratagem, Effect Section " +
  "Change 3\" to 6\". Company of Hunters Detachment, Keywords Section Change to " +
  "' OUTRIDER SQUAD units from your army gain the BATTLELINE keyword.'";
const LORE =
  "CHAOS DAEMONS ARMY RULES When daemons pour into realspace, maelstroms of warp energy ...";

describe("classifyPage", () => {
  it("types a datasheet stat block (FACTION KEYWORDS) as datasheet", () => {
    expect(classifyPage(DATASHEET)).toBe(PAGE_TYPE.DATASHEET);
  });

  it("types detachment rules / enhancements / stratagem pages as detachment", () => {
    expect(classifyPage(DETACHMENT_RULES)).toBe(PAGE_TYPE.DETACHMENT);
    expect(classifyPage(DETACHMENT_STRATAGEM_PAGE)).toBe(PAGE_TYPE.DETACHMENT);
    expect(classifyPage(DETACHMENT_RULE_SINGULAR)).toBe(PAGE_TYPE.DETACHMENT);
  });

  it("types rules-update / errata pages as rulesUpdate", () => {
    expect(classifyPage(RULES_UPDATE)).toBe(PAGE_TYPE.RULES_UPDATE);
  });

  it("ranks rules-update markers above detachment markers (errata mentioning Stratagem)", () => {
    // Without priority ordering this would mis-type as detachment.
    expect(classifyPage(RULES_UPDATE_WITH_STRATAGEM)).toBe(PAGE_TYPE.RULES_UPDATE);
  });

  it("types army-rule / lore intros as other", () => {
    expect(classifyPage(LORE)).toBe(PAGE_TYPE.OTHER);
    expect(classifyPage("")).toBe(PAGE_TYPE.OTHER);
  });
});

describe("filterPagesByType", () => {
  it("returns only pages of the requested type(s), preserving order", () => {
    const pages = [LORE, DATASHEET, RULES_UPDATE, DETACHMENT_RULES, DATASHEET];
    expect(filterPagesByType(pages, PAGE_TYPE.DATASHEET)).toEqual([
      DATASHEET,
      DATASHEET,
    ]);
    expect(
      filterPagesByType(pages, PAGE_TYPE.DETACHMENT, PAGE_TYPE.RULES_UPDATE)
    ).toEqual([RULES_UPDATE, DETACHMENT_RULES]);
  });
});
