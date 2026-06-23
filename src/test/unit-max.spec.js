import { describe, it, expect } from "vitest";
import { unitMax } from "../utils/unit-max";

// Strike Force (1001-2000 pts) caps: 3 non-battleline, 6 battleline.
// Incursion (<= 1000 pts) caps: 2 / 4.
function strikeForceList(overrides = {}) {
  return {
    faction: "ORKS",
    maxPoints: 2000,
    detachments: [],
    bonusBattleline: [],
    units: [],
    ...overrides,
  };
}

describe("unitMax", () => {
  it("returns 1 for an Epic Hero regardless of list state", () => {
    expect(unitMax({ name: "WAZDAKKA GUTSMEK", keywords: ["EPIC HERO"] }, strikeForceList())).toBe(1);
  });

  it("returns the battleline cap for a static Battleline unit", () => {
    expect(
      unitMax({ name: "BOYZ", keywords: ["BATTLELINE"] }, strikeForceList())
    ).toBe(6);
  });

  it("returns the unit cap for a non-battleline / non-transport unit", () => {
    expect(unitMax({ name: "STORMBOYZ" }, strikeForceList())).toBe(3);
  });

  it("returns the battleline cap when bonusBattleline includes the datasheet", () => {
    const list = strikeForceList({ bonusBattleline: ["WARBIKERS"] });
    expect(unitMax({ name: "WARBIKERS" }, list)).toBe(6);
  });

  it("does not lift the cap for a different datasheet", () => {
    const list = strikeForceList({ bonusBattleline: ["WARBIKERS"] });
    expect(unitMax({ name: "STORMBOYZ" }, list)).toBe(3);
  });

  it("uses incursion caps when maxPoints <= 1000", () => {
    const list = strikeForceList({ maxPoints: 1000 });
    expect(unitMax({ name: "BOYZ", keywords: ["BATTLELINE"] }, list)).toBe(4);
    expect(unitMax({ name: "STORMBOYZ" }, list)).toBe(2);
  });
});
