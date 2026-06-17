import { describe, it, expect } from "vitest";
import {
  WARGEAR_DEFAULT_MAX_PER_UNIT,
  wargearMaxPerUnit,
  wargearCountOn,
  findAvailableWargearHost,
} from "../utils/wargear-limits";

const wgr = (id, attachedTo, optionName) => ({
  id,
  name: "Wargear",
  parentDataSheet: "FIELD ORDNANCE BATTERY",
  optionName,
  attachedTo,
});

describe("wargearMaxPerUnit", () => {
  it("returns the default constant when the option carries no override", () => {
    expect(wargearMaxPerUnit({})).toBe(WARGEAR_DEFAULT_MAX_PER_UNIT);
    expect(wargearMaxPerUnit({ name: "x", points: 5 })).toBe(20);
  });

  it("honors a future per-option override", () => {
    expect(wargearMaxPerUnit({ maxPerUnit: 3 })).toBe(3);
    expect(wargearMaxPerUnit({ maxPerUnit: 0 })).toBe(0);
  });

  it("falls back gracefully for null / undefined", () => {
    expect(wargearMaxPerUnit(undefined)).toBe(20);
    expect(wargearMaxPerUnit(null)).toBe(20);
  });
});

describe("wargearCountOn", () => {
  const units = [
    { id: "host", name: "FIELD ORDNANCE BATTERY" },
    wgr("a", "host", "Bombast field gun"),
    wgr("b", "host", "Bombast field gun"),
    wgr("c", "host", "Some other gun"),
    wgr("d", "OTHER-HOST", "Bombast field gun"),
    { id: "e", name: "Enhancements", attachedTo: "host" },
  ];

  it("counts only Wargear sentinels matching hostId + optionName", () => {
    expect(wargearCountOn(units, "host", "Bombast field gun")).toBe(2);
    expect(wargearCountOn(units, "host", "Some other gun")).toBe(1);
    expect(wargearCountOn(units, "OTHER-HOST", "Bombast field gun")).toBe(1);
  });

  it("returns 0 when nothing matches", () => {
    expect(wargearCountOn(units, "host", "Unknown")).toBe(0);
    expect(wargearCountOn(units, "ghost", "Bombast field gun")).toBe(0);
  });

  it("ignores enhancements with the same attachedTo", () => {
    // The Enhancements row above must not bleed into the count.
    expect(wargearCountOn(units, "host", "Bombast field gun")).toBe(2);
  });

  it("excludes excludeId when computing 'are any OTHER copies present'", () => {
    expect(wargearCountOn(units, "host", "Bombast field gun", "a")).toBe(1);
    expect(wargearCountOn(units, "host", "Bombast field gun", "b")).toBe(1);
    // excludeId for an id that isn't a match leaves the count unchanged
    expect(wargearCountOn(units, "host", "Bombast field gun", "zzz")).toBe(2);
  });
});

describe("findAvailableWargearHost", () => {
  it("returns the first matching host whose count is below the cap", () => {
    const units = [
      { id: "h1", name: "FIELD ORDNANCE BATTERY" },
      { id: "h2", name: "FIELD ORDNANCE BATTERY" },
    ];
    expect(
      findAvailableWargearHost(units, "FIELD ORDNANCE BATTERY", "X", 3)?.id
    ).toBe("h1");
  });

  it("skips a maxed host and falls through to the next matching one", () => {
    const units = [
      { id: "h1", name: "FIELD ORDNANCE BATTERY" },
      wgr("w1", "h1", "X"),
      wgr("w2", "h1", "X"),
      wgr("w3", "h1", "X"),
      { id: "h2", name: "FIELD ORDNANCE BATTERY" },
    ];
    // Cap = 3, h1 is at 3 → pick h2.
    expect(
      findAvailableWargearHost(units, "FIELD ORDNANCE BATTERY", "X", 3)?.id
    ).toBe("h2");
  });

  it("returns null when every matching host is saturated", () => {
    const units = [
      { id: "h1", name: "FIELD ORDNANCE BATTERY" },
      wgr("w1", "h1", "X"),
      wgr("w2", "h1", "X"),
      { id: "h2", name: "FIELD ORDNANCE BATTERY" },
      wgr("w3", "h2", "X"),
      wgr("w4", "h2", "X"),
    ];
    expect(
      findAvailableWargearHost(units, "FIELD ORDNANCE BATTERY", "X", 2)
    ).toBeNull();
  });

  it("returns null when no host of the right datasheet exists", () => {
    const units = [
      { id: "h", name: "SOME OTHER UNIT" },
      { id: "e", name: "Enhancements" },
    ];
    expect(
      findAvailableWargearHost(units, "FIELD ORDNANCE BATTERY", "X", 3)
    ).toBeNull();
  });

  it("only counts copies of the SAME option name toward each host's cap", () => {
    const units = [
      { id: "h1", name: "FIELD ORDNANCE BATTERY" },
      wgr("a", "h1", "Bombast field gun"),
      wgr("b", "h1", "Bombast field gun"),
      wgr("c", "h1", "Bombast field gun"),
      // Different option — should not exhaust h1's "Other gun" cap.
    ];
    expect(
      findAvailableWargearHost(units, "FIELD ORDNANCE BATTERY", "Other gun", 3)
        ?.id
    ).toBe("h1");
    expect(
      findAvailableWargearHost(
        units,
        "FIELD ORDNANCE BATTERY",
        "Bombast field gun",
        3
      )
    ).toBeNull();
  });
});
