import { describe, it, expect } from "vitest";

import { getEnhancementRestrictions } from "../data/configs";
import { normalizeString } from "../utils/name-match";
import enhancementRestrictionsAuto from "../data/configs/enhancement-restrictions.auto.json";

// The three-layer merge in src/data/configs/index.js — manual > MFM-PDF >
// BSData — needs end-to-end coverage so a future refactor doesn't silently
// flip the priority order. We pin to specific real entries that exist in
// each layer (or don't), spot-checking the actual JSON files.

describe("getEnhancementRestrictions — layer priority (manual > MFM-PDF > BSData)", () => {
  it("returns null for an unknown faction or enhancement", () => {
    expect(getEnhancementRestrictions(null, "X")).toBe(null);
    expect(getEnhancementRestrictions("NECRONS", null)).toBe(null);
    expect(getEnhancementRestrictions("NOT A FACTION", "X")).toBe(null);
    expect(getEnhancementRestrictions("NECRONS", "Not A Real Enhancement")).toBe(
      null
    );
  });

  it("returns the MFM-PDF entry for an enhancement present in BOTH MFM-PDF and BSData (MFM-PDF wins)", () => {
    // Necron "Quantum Goad" is GW-authoritative in MFM-PDF (allowedHosts:
    // [C'TAN SHARD OF THE NIGHTBRINGER]). BSData doesn't carry an
    // ancestor-scope condition for it (its host eligibility is in the
    // Description text only), so the BSData layer has no entry — but even
    // when both layers carry an entry, MFM-PDF must win.
    const entry = getEnhancementRestrictions("NECRONS", "Quantum Goad");
    expect(entry).not.toBeNull();
    expect(entry.allowedHosts).toContain("C’TAN SHARD OF THE NIGHTBRINGER");
  });

  it("returns the BSData entry for a codex-resident enhancement absent from MFM-PDF", () => {
    // "Death Mask of Ollanius" is in the Astra Militarum codex and was
    // stripped from the MFM Faction Pack PDF — MFM-PDF has no entry for it,
    // BSData supplies requiredKeywords: ["OFFICER"].
    const entry = getEnhancementRestrictions(
      "ASTRA MILITARUM",
      "Death Mask of Ollanius"
    );
    expect(entry).not.toBeNull();
    expect(entry.requiredKeywords).toEqual(["OFFICER"]);
  });

  it("returns null when the enhancement is absent from every layer", () => {
    expect(
      getEnhancementRestrictions("NECRONS", "Definitely Not An Enhancement")
    ).toBe(null);
  });

  it("resolves regardless of faction/enhancement punctuation or case (normalized lookup)", () => {
    const canonical = getEnhancementRestrictions("NECRONS", "Quantum Goad");
    expect(canonical).not.toBeNull();
    // Same entry via differently-cased/punctuated keys — must not desync.
    expect(getEnhancementRestrictions("necrons", "quantum-goad")).toEqual(
      canonical
    );
    expect(getEnhancementRestrictions("Necrons", "QUANTUM GOAD")).toEqual(
      canonical
    );
  });
});

// Guards the normalized-lookup approach: if two enhancements within a faction
// collapse to the same key under normalizeString, one would shadow the other.
// This should never happen with real data; if it does, the lookup needs a
// diacritic-preserving canonical form instead.
describe("enhancement-restrictions.auto.json — no normalized-key collisions", () => {
  it("has unique enhancement names per faction under normalizeString", () => {
    const collisions = [];
    for (const [faction, entries] of Object.entries(enhancementRestrictionsAuto)) {
      if (faction.startsWith("_") || !entries || typeof entries !== "object") {
        continue;
      }
      const seen = new Map();
      for (const name of Object.keys(entries)) {
        const key = normalizeString(name);
        if (seen.has(key)) {
          collisions.push(`${faction}: "${seen.get(key)}" vs "${name}"`);
        } else {
          seen.set(key, name);
        }
      }
    }
    expect(collisions).toEqual([]);
  });
});
