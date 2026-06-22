import { describe, it, expect } from "vitest";
import {
  conditionalBattlelineUnits,
  autoBattlelineSource,
} from "../utils/conditional-battleline";

// Pass rules explicitly via the helper's optional second argument so each test
// pins its own data and is independent of the live auto.json file.
const RULES = {
  ORKS: [
    {
      trigger: { type: "detachment", name: "TAKTIKAL BRIGADE" },
      battleLine: ["STORMBOYZ"],
    },
  ],
  TYRANIDS: [
    {
      trigger: { type: "detachment", name: "WARRIOR BIOFORM ONSLAUGHT" },
      battleLine: [
        "TYRANID WARRIORS WITH RANGED BIO-WEAPONS",
        "TYRANID WARRIORS WITH MELEE BIO-WEAPONS",
      ],
    },
  ],
  // Forward-compat sanity: rules with an unknown trigger.type should be
  // silently skipped without crashing the helper.
  FUTURE_FACTION: [
    {
      trigger: { type: "warlord", name: "SOME CHARACTER" },
      battleLine: ["FUTURE UNIT"],
    },
  ],
};

describe("conditionalBattlelineUnits", () => {
  it("returns empty for a faction with no rules and no manual override", () => {
    const result = conditionalBattlelineUnits(
      { faction: "NECRONS", detachments: [], units: [] },
      RULES
    );
    expect([...result]).toEqual([]);
  });

  it("returns empty when no list is provided", () => {
    expect([...conditionalBattlelineUnits(null, RULES)]).toEqual([]);
    expect([...conditionalBattlelineUnits(undefined, RULES)]).toEqual([]);
    expect([...conditionalBattlelineUnits({}, RULES)]).toEqual([]);
  });

  it("fires a detachment rule when the detachment is in the list", () => {
    const result = conditionalBattlelineUnits(
      { faction: "ORKS", detachments: ["TAKTIKAL BRIGADE"], units: [] },
      RULES
    );
    expect([...result]).toEqual(["STORMBOYZ"]);
  });

  it("does not fire a detachment rule when the detachment is absent", () => {
    const result = conditionalBattlelineUnits(
      { faction: "ORKS", detachments: ["SPEEDWAAAGH"], units: [] },
      RULES
    );
    expect([...result]).toEqual([]);
  });

  it("fires a detachment rule with multiple affected units", () => {
    const result = conditionalBattlelineUnits(
      {
        faction: "TYRANIDS",
        detachments: ["WARRIOR BIOFORM ONSLAUGHT"],
        units: [],
      },
      RULES
    );
    expect(new Set(result)).toEqual(
      new Set([
        "TYRANID WARRIORS WITH RANGED BIO-WEAPONS",
        "TYRANID WARRIORS WITH MELEE BIO-WEAPONS",
      ])
    );
  });

  it("returns manual overrides regardless of detachments", () => {
    const result = conditionalBattlelineUnits(
      {
        faction: "ORKS",
        detachments: [],
        bonusBattleline: ["WARBIKERS"],
        units: [],
      },
      RULES
    );
    expect([...result]).toEqual(["WARBIKERS"]);
  });

  it("unions auto + manual without duplicates", () => {
    const result = conditionalBattlelineUnits(
      {
        faction: "ORKS",
        detachments: ["TAKTIKAL BRIGADE"],
        bonusBattleline: ["STORMBOYZ", "WARBIKERS"],
        units: [],
      },
      RULES
    );
    expect(new Set(result)).toEqual(new Set(["STORMBOYZ", "WARBIKERS"]));
  });

  it("skips unknown trigger.type values (forward-compat)", () => {
    const result = conditionalBattlelineUnits(
      { faction: "FUTURE_FACTION", detachments: [], units: [] },
      RULES
    );
    expect([...result]).toEqual([]);
  });
});

describe("autoBattlelineSource", () => {
  it("returns the trigger object when an auto rule grants the unit", () => {
    const trigger = autoBattlelineSource(
      { faction: "ORKS", detachments: ["TAKTIKAL BRIGADE"], units: [] },
      "STORMBOYZ",
      RULES
    );
    expect(trigger).toEqual({ type: "detachment", name: "TAKTIKAL BRIGADE" });
  });

  it("returns null when no auto rule grants the unit", () => {
    const trigger = autoBattlelineSource(
      { faction: "ORKS", detachments: [], units: [] },
      "STORMBOYZ",
      RULES
    );
    expect(trigger).toBeNull();
  });

  it("ignores manual overrides — only reports auto-rule triggers", () => {
    const trigger = autoBattlelineSource(
      {
        faction: "ORKS",
        detachments: [],
        bonusBattleline: ["WARBIKERS"],
        units: [],
      },
      "WARBIKERS",
      RULES
    );
    expect(trigger).toBeNull();
  });
});
