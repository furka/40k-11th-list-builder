import { describe, it, expect, vi, beforeEach } from "vitest";
import { battleSizeRules } from "../utils/battle-size";

vi.mock("../utils/is-battleline", () => ({ isBattleLine: vi.fn() }));
vi.mock("../utils/is-dedicated-transport", () => ({
  isDedicatedTransport: vi.fn(),
}));

import { isBattleLine } from "../utils/is-battleline";
import { isDedicatedTransport } from "../utils/is-dedicated-transport";
import { unitMax } from "../utils/unit-max";

describe("battleSizeRules", () => {
  it("returns Incursion rules under 2000 points", () => {
    expect(battleSizeRules({ maxPoints: 1000 })).toMatchObject({
      label: "Incursion",
      maxDP: 2,
      maxEnhancements: 2,
      unitCap: 2,
      battlelineCap: 4,
      allow3DpDetachment: false,
    });
  });

  it("returns Strike Force rules at 2000 points", () => {
    expect(battleSizeRules({ maxPoints: 2000 })).toMatchObject({
      label: "Strike Force",
      maxDP: 3,
      maxEnhancements: 4,
      unitCap: 3,
      battlelineCap: 6,
      allow3DpDetachment: true,
    });
  });

  it("uses Strike Force at 3000+ (Onslaught is not yet documented)", () => {
    expect(battleSizeRules({ maxPoints: 3000 }).label).toBe("Strike Force");
  });

  it("defaults to Strike Force when no maxPoints is provided", () => {
    expect(battleSizeRules({}).label).toBe("Strike Force");
    expect(battleSizeRules(undefined).label).toBe("Strike Force");
  });
});

describe("unitMax", () => {
  const incursion = { maxPoints: 1000 };
  const strikeForce = { maxPoints: 2000 };

  beforeEach(() => {
    vi.clearAllMocks();
    isBattleLine.mockReturnValue(false);
    isDedicatedTransport.mockReturnValue(false);
  });

  it("caps Epic Hero at 1 regardless of battle size", () => {
    expect(unitMax({ epicHero: true }, incursion)).toBe(1);
    expect(unitMax({ epicHero: true }, strikeForce)).toBe(1);
  });

  it("standard unit cap is 2 at Incursion, 3 at Strike Force", () => {
    expect(unitMax({ name: "Necron Warriors" }, incursion)).toBe(2);
    expect(unitMax({ name: "Necron Warriors" }, strikeForce)).toBe(3);
  });

  it("Battleline doubles the standard cap", () => {
    isBattleLine.mockReturnValue(true);
    expect(unitMax({ battleLine: true }, incursion)).toBe(4);
    expect(unitMax({ battleLine: true }, strikeForce)).toBe(6);
  });

  it("Dedicated Transport uses the Battleline cap", () => {
    isDedicatedTransport.mockReturnValue(true);
    expect(unitMax({ dedicatedTransport: true }, incursion)).toBe(4);
    expect(unitMax({ dedicatedTransport: true }, strikeForce)).toBe(6);
  });
});
