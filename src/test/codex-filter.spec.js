import { describe, it, expect } from "vitest";
import {
  matchesDatasheet,
  matchesDetachment,
  matchesRoleLabel,
} from "../utils/codex-filter";

const sheet = (overrides = {}) => ({ name: "TEST UNIT", ...overrides });

describe("matchesDatasheet", () => {
  it("returns true for empty / whitespace queries (no filtering)", () => {
    expect(matchesDatasheet(sheet(), "")).toBe(true);
    expect(matchesDatasheet(sheet(), "  ")).toBe(true);
    expect(matchesDatasheet(sheet(), undefined)).toBe(true);
  });

  it("matches by case-insensitive substring on the unit name", () => {
    const s = sheet({ name: "NECRON WARRIORS" });
    expect(matchesDatasheet(s, "necron")).toBe(true);
    expect(matchesDatasheet(s, "WARRIORS")).toBe(true);
    expect(matchesDatasheet(s, "  warrior  ")).toBe(true);
    expect(matchesDatasheet(s, "lychguard")).toBe(false);
  });

  it("'leader' surfaces units with a leader marker", () => {
    expect(matchesDatasheet(sheet({ leader: { attachesTo: ["A"] } }), "leader")).toBe(true);
    expect(matchesDatasheet(sheet({ leader: null }), "leader")).toBe(false);
  });

  it("'support' surfaces units with a support marker", () => {
    expect(matchesDatasheet(sheet({ support: { attachesTo: ["A"] } }), "support")).toBe(true);
    expect(matchesDatasheet(sheet({ support: null }), "support")).toBe(false);
  });

  it("'battle line' (with and without space) surfaces battleline units", () => {
    const s = sheet({ keywords: ["BATTLELINE"] });
    expect(matchesDatasheet(s, "battle line")).toBe(true);
    expect(matchesDatasheet(s, "battleline")).toBe(true);
    expect(matchesDatasheet(s, "BATTLE LINE")).toBe(true);
  });

  it("'character' surfaces character units", () => {
    expect(matchesDatasheet(sheet({ keywords: ["CHARACTER"] }), "character")).toBe(true);
  });

  it("'epic hero' (with and without space) surfaces epic-hero units", () => {
    const s = sheet({ keywords: ["EPIC HERO"] });
    expect(matchesDatasheet(s, "epic hero")).toBe(true);
    expect(matchesDatasheet(s, "epichero")).toBe(true);
  });

  it("'transport' / 'dedicated transport' surfaces dedicated-transport units", () => {
    const s = sheet({ keywords: ["DEDICATED TRANSPORT"] });
    expect(matchesDatasheet(s, "transport")).toBe(true);
    expect(matchesDatasheet(s, "dedicated transport")).toBe(true);
  });

  it("'fortification' surfaces fortifications", () => {
    expect(matchesDatasheet(sheet({ keywords: ["FORTIFICATION"] }), "fortification")).toBe(true);
  });

  it("'legends' surfaces legends units", () => {
    expect(matchesDatasheet(sheet({ legends: true }), "legends")).toBe(true);
  });

  it("a sub-string of a role label matches its predicate", () => {
    // "le" is a substring of both "leader" and "legends"
    expect(matchesRoleLabel(sheet({ leader: { attachesTo: ["A"] } }), "le")).toBe(true);
    expect(matchesRoleLabel(sheet({ legends: true }), "le")).toBe(true);
    // …but only when the predicate applies
    expect(matchesRoleLabel(sheet({}), "le")).toBe(false);
  });

  it("does not cross-match: typing 'leader' should not surface non-leaders", () => {
    expect(matchesDatasheet(sheet({ keywords: ["CHARACTER"] }), "leader")).toBe(false);
    expect(matchesDatasheet(sheet({ legends: true }), "leader")).toBe(false);
  });
});

describe("matchesDetachment", () => {
  const det = (overrides = {}) => ({
    name: "TEST DETACHMENT",
    dp: 2,
    role: null,
    leader: null,
    tags: [],
    enhancements: [],
    ...overrides,
  });

  it("returns true for empty queries", () => {
    expect(matchesDetachment(det(), "")).toBe(true);
    expect(matchesDetachment(det(), undefined)).toBe(true);
  });

  it("matches by detachment name (case-insensitive)", () => {
    const d = det({ name: "AWAKENED DYNASTY" });
    expect(matchesDetachment(d, "awak")).toBe(true);
    expect(matchesDetachment(d, "DYNASTY")).toBe(true);
    expect(matchesDetachment(d, "hypercrypt")).toBe(false);
  });

  it("matches by role name", () => {
    const d = det({ role: { name: "RECONNAISSANCE", color: "#008080" } });
    expect(matchesDetachment(d, "recon")).toBe(true);
    expect(matchesDetachment(d, "RECONNAISSANCE")).toBe(true);
  });

  it("matches by UNIQUE tag", () => {
    const d = det({ tags: ["UNIQUE: HYPERCRYPT"] });
    expect(matchesDetachment(d, "hypercrypt")).toBe(true);
    expect(matchesDetachment(d, "unique")).toBe(true);
  });

  it("matches by enhancement name", () => {
    const d = det({
      enhancements: [{ name: "Veil of Darkness", points: 20 }],
    });
    expect(matchesDetachment(d, "veil")).toBe(true);
    expect(matchesDetachment(d, "darkness")).toBe(true);
    expect(matchesDetachment(d, "shroud")).toBe(false);
  });

  it("'leader' surfaces detachments with a detachment-level LEADER block", () => {
    const withLeader = det({
      leader: { attachesTo: ["LOKHUST DESTROYERS"] },
    });
    const without = det({ leader: null });
    expect(matchesDetachment(withLeader, "leader")).toBe(true);
    expect(matchesDetachment(without, "leader")).toBe(false);
  });

  it("returns false when no field matches", () => {
    expect(matchesDetachment(det(), "nonsense")).toBe(false);
  });
});
