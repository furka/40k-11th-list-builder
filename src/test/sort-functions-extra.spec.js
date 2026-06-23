import { describe, it, expect } from "vitest";
import {
  sortDataSheetPtsAscending,
  sortDataSheetPtsDescending,
  sortOptionsPtsDescending,
  sortListByRole,
  sortTree,
} from "../utils/sort-functions";

const sheet = (name, sizes) => ({ name, sizes });
const size = (points, basePoints) =>
  basePoints === undefined ? { points } : { points, basePoints };

describe("sortDataSheetPtsDescending", () => {
  it("orders by most-expensive size, expensive first", () => {
    const a = sheet("A", [size(100), size(200)]);
    const b = sheet("B", [size(150), size(300)]);
    const c = sheet("C", [size(50)]);
    const result = [a, b, c].sort(sortDataSheetPtsDescending);
    expect(result.map((s) => s.name)).toEqual(["B", "A", "C"]);
  });

  it("uses basePoints when present, in preference to points", () => {
    const cheap = sheet("Cheap", [size(999, 50)]);
    const pricey = sheet("Pricey", [size(10, 500)]);
    const result = [cheap, pricey].sort(sortDataSheetPtsDescending);
    expect(result.map((s) => s.name)).toEqual(["Pricey", "Cheap"]);
  });

  it("treats a tie as equal", () => {
    const a = sheet("A", [size(100)]);
    const b = sheet("B", [size(100)]);
    expect(sortDataSheetPtsDescending(a, b)).toBe(0);
  });
});

describe("sortDataSheetPtsAscending", () => {
  it("orders by cheapest size, cheap first", () => {
    const a = sheet("A", [size(100), size(200)]);
    const b = sheet("B", [size(150), size(300)]);
    const c = sheet("C", [size(50)]);
    const result = [a, b, c].sort(sortDataSheetPtsAscending);
    expect(result.map((s) => s.name)).toEqual(["C", "A", "B"]);
  });

  it("uses basePoints when present, in preference to points", () => {
    const cheap = sheet("Cheap", [size(999, 50)]);
    const pricey = sheet("Pricey", [size(10, 500)]);
    const result = [cheap, pricey].sort(sortDataSheetPtsAscending);
    expect(result.map((s) => s.name)).toEqual(["Cheap", "Pricey"]);
  });
});

describe("sortOptionsPtsDescending", () => {
  it("orders option objects expensive first", () => {
    const opts = [size(100), size(300), size(50)];
    expect(opts.sort(sortOptionsPtsDescending).map((o) => o.points)).toEqual([
      300, 100, 50,
    ]);
  });

  it("uses basePoints over points when present", () => {
    const opts = [size(10, 500), size(999, 1)];
    const result = opts.sort(sortOptionsPtsDescending);
    expect(result[0].basePoints).toBe(500);
    expect(result[1].basePoints).toBe(1);
  });
});

describe("sortListByRole — uncovered priority branches", () => {
  const sheets = {
    "Hero": { keywords: ["EPIC HERO"] },
    "Tank": { keywords: ["DEDICATED TRANSPORT"] },
    "Bastion": { keywords: ["FORTIFICATION"] },
    "Squad": { keywords: ["BATTLELINE"] },
    "Mystery": { /* no keywords at all */ },
    "Captain": { leader: true },
  };
  const getDataSheet = (name) => sheets[name] ?? null;

  it("epic hero gets the same priority as character (1)", () => {
    const units = [
      { id: "s", name: "Squad" },
      { id: "h", name: "Hero" },
    ];
    expect(
      sortTree(units, sortListByRole(getDataSheet)).map((u) => u.id)
    ).toEqual(["h", "s"]);
  });

  it("dedicated transport (5) sorts after battle-line (4)", () => {
    const units = [
      { id: "t", name: "Tank" },
      { id: "s", name: "Squad" },
    ];
    expect(
      sortTree(units, sortListByRole(getDataSheet)).map((u) => u.id)
    ).toEqual(["s", "t"]);
  });

  it("fortification (8) sorts last among known roles", () => {
    const units = [
      { id: "b", name: "Bastion" },
      { id: "t", name: "Tank" },
      { id: "s", name: "Squad" },
    ];
    expect(
      sortTree(units, sortListByRole(getDataSheet)).map((u) => u.id)
    ).toEqual(["s", "t", "b"]);
  });

  it("unknown role with a datasheet (no flags) gets priority 6 — after battle-line", () => {
    const units = [
      { id: "m", name: "Mystery" },
      { id: "s", name: "Squad" },
    ];
    expect(
      sortTree(units, sortListByRole(getDataSheet)).map((u) => u.id)
    ).toEqual(["s", "m"]);
  });

  it("missing datasheet (returns null) gets priority 5", () => {
    // No datasheet for "Ghost"; default priority 5 puts it ahead of priority-6 Mystery.
    const units = [
      { id: "m", name: "Mystery" },
      { id: "g", name: "Ghost" },
    ];
    expect(
      sortTree(units, sortListByRole(getDataSheet)).map((u) => u.id)
    ).toEqual(["g", "m"]);
  });

  it("a child named 'Wargear' sorts last within its host (priority 7)", () => {
    const units = [
      { id: "h", name: "Squad" },
      { id: "w", name: "Wargear", attachedTo: "h" },
      { id: "c", name: "Captain", attachedTo: "h" },
    ];
    expect(
      sortTree(units, sortListByRole(getDataSheet)).map((u) => u.id)
    ).toEqual(["h", "c", "w"]);
  });
});
