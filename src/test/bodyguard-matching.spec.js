import { describe, it, expect } from "vitest";
import { maxBipartiteMatching } from "../utils/bodyguard-matching";

describe("maxBipartiteMatching", () => {
  it("matches all items when there are enough bodyguards", () => {
    const items = [
      { id: "g1", attachesTo: ["IMMORTALS", "NECRON WARRIORS"] },
      { id: "g2", attachesTo: ["IMMORTALS", "NECRON WARRIORS"] },
    ];
    const matched = maxBipartiteMatching(items, { "NECRON WARRIORS": 2 });
    expect(matched.size).toBe(2);
    expect(matched.has("g1")).toBe(true);
    expect(matched.has("g2")).toBe(true);
  });

  it("flags the cross-type case the naive count check misses", () => {
    // 2 Geomancers + 1 Plasmancer + 2 Necron Warriors. Each support's
    // attaches-to is satisfiable individually, but the total demand (3)
    // exceeds the bodyguard supply (2).
    const items = [
      { id: "geo1", attachesTo: ["IMMORTALS", "NECRON WARRIORS"] },
      { id: "geo2", attachesTo: ["IMMORTALS", "NECRON WARRIORS"] },
      { id: "plas1", attachesTo: ["IMMORTALS", "NECRON WARRIORS"] },
    ];
    const matched = maxBipartiteMatching(items, { "NECRON WARRIORS": 2 });
    expect(matched.size).toBe(2);
  });

  it("matches via the second attaches-to entry when the first is full", () => {
    const items = [
      { id: "g1", attachesTo: ["IMMORTALS", "NECRON WARRIORS"] },
      { id: "g2", attachesTo: ["IMMORTALS"] },
    ];
    // Only 1 IMMORTALS — g2 must take it, g1 must fall back to WARRIORS.
    const matched = maxBipartiteMatching(items, {
      IMMORTALS: 1,
      "NECRON WARRIORS": 1,
    });
    expect(matched.size).toBe(2);
  });

  it("augments past an existing assignment when needed", () => {
    // Without an augmenting path: g1 greedily takes IMMORTALS, then g2
    // (which only accepts IMMORTALS) can't match. With augmenting paths,
    // g1 gets displaced to WARRIORS so g2 can have IMMORTALS.
    const items = [
      { id: "g1", attachesTo: ["IMMORTALS", "NECRON WARRIORS"] },
      { id: "g2", attachesTo: ["IMMORTALS"] },
    ];
    const matched = maxBipartiteMatching(items, {
      IMMORTALS: 1,
      "NECRON WARRIORS": 1,
    });
    expect(matched.size).toBe(2);
  });

  it("returns an empty set when there are no bodyguards", () => {
    const items = [
      { id: "g1", attachesTo: ["IMMORTALS"] },
      { id: "g2", attachesTo: ["IMMORTALS"] },
    ];
    const matched = maxBipartiteMatching(items, {});
    expect(matched.size).toBe(0);
  });

  it("ignores attaches-to entries that no bodyguard provides", () => {
    const items = [{ id: "g1", attachesTo: ["LYCHGUARD"] }];
    const matched = maxBipartiteMatching(items, { "NECRON WARRIORS": 5 });
    expect(matched.size).toBe(0);
  });
});
