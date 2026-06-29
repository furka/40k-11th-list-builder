import { describe, it, expect } from "vitest";

import { getEnhancementRestrictions } from "../data/configs";
// The BSData layer is the only source carrying straight U+0027 and leading
// U+2018 apostrophes in allowedHosts (Bombast-class Vox-array). MFM-PDF
// shadows it through `getEnhancementRestrictions` priority, so those
// variants have to be asserted against the raw JSON to confirm the data
// layer preserves the byte form. The vitest JSON loader keeps unicode
// codepoints intact.
import bsdataAuto from "../data/configs/enhancement-restrictions.bsdata.auto.json";

// Regression coverage for unusual patterns in the real
// enhancement-restrictions data — every test pins a specific real entry
// (not synthetic) and exercises the same disjunction/AND logic the runtime
// validator uses. The validator lives in src/stores/armyList.js:330-344 and
// src/utils/legal-drop-slots.js:218-225; the simulator below mirrors that
// logic exactly so these tests don't need to mount the Pinia store.

function simulateAllowedHostsDisjunction(meta, hostName, hostKeywordSet) {
  if (!meta?.allowedHosts?.length && !meta?.requiredKeywords?.length) return true;
  const nameMatch = meta.allowedHosts?.includes(hostName);
  const keywordMatch =
    meta.requiredKeywords?.length > 0 &&
    meta.requiredKeywords.every((k) => hostKeywordSet.has(k));
  return Boolean(nameMatch || keywordMatch);
}

describe("enhancement-restrictions — apostrophes canonicalize to U+2019", () => {
  // All apostrophe-like codepoints (U+0027 straight, U+2018 leading curly,
  // U+02BC/U+02BB modifier letters) are collapsed to U+2019 at scrape time
  // by `normalizeApostrophesDeep` in src/utils/apostrophe-normalization.js,
  // and the existing JSON has been migrated to match via
  // scripts/migrate-apostrophes.mjs. These tests pin the canonical form so
  // that a regression — a scraper change that emits a non-canonical byte,
  // or a manual edit that introduces one — surfaces immediately.

  it("Quantum Goad's allowedHost uses canonical U+2019 (C’TAN SHARD OF THE NIGHTBRINGER)", () => {
    const meta = getEnhancementRestrictions("NECRONS", "Quantum Goad");
    expect(meta?.allowedHosts).toEqual(["C’TAN SHARD OF THE NIGHTBRINGER"]);
    const host = "C’TAN SHARD OF THE NIGHTBRINGER";
    expect(
      simulateAllowedHostsDisjunction(meta, host, new Set())
    ).toBe(true);
    // Defense in depth: the validator is byte-exact and does NOT normalize
    // at compare time, so a straight-apostrophe lookup must miss. This
    // confirms the runtime relies on the data layer to canonicalize, not on
    // a runtime fallback.
    expect(
      simulateAllowedHostsDisjunction(meta, "C'TAN SHARD OF THE NIGHTBRINGER", new Set())
    ).toBe(false);
  });

  it("post-migration, Bombast-class Vox-array's allowedHosts use canonical U+2019 throughout (HELL’S LAST + ‘IRON HAND’ STRAKEN both curly)", () => {
    const meta = bsdataAuto["ASTRA MILITARUM"]?.["Bombast-class Vox-array"];
    expect(meta?.allowedHosts).toContain("HELL’S LAST");
    expect(meta?.allowedHosts).toContain("’IRON HAND’ STRAKEN");
    // The pre-migration variants must NOT appear anywhere in the list —
    // every entry should be canonical now.
    for (const h of meta?.allowedHosts ?? []) {
      expect(h).not.toMatch(/['‘ʼʻ]/);
    }
  });

  it("no entry across any auto layer carries non-canonical apostrophes (full sweep of bsdataAuto)", () => {
    function walk(value) {
      if (typeof value === "string") {
        expect(value).not.toMatch(/['‘ʼʻ]/);
      } else if (Array.isArray(value)) {
        for (const item of value) walk(item);
      } else if (value && typeof value === "object") {
        for (const k of Object.keys(value)) {
          expect(k).not.toMatch(/['‘ʼʻ]/);
          walk(value[k]);
        }
      }
    }
    walk(bsdataAuto);
  });
});

describe("enhancement-restrictions — multi-keyword AND requires every keyword", () => {
  // 160 entries in MFM-PDF have requiredKeywords of length ≥2. The runtime
  // joins them with `every` (AND), so a host satisfying only a subset must
  // fail. Eyes of the Oracle requires [ADEPTA SORORITAS, CHARACTER] — a
  // non-character Sororitas unit (Battle Sisters Squad) must be rejected.

  it("Eyes of the Oracle requires ADEPTA SORORITAS (CHARACTER-only enforced by the enhancement default, not the keyword list)", () => {
    // The PDF host phrase is "Adepta Sororitas model only" — no explicit
    // CHARACTER keyword. Enhancements are CHARACTER-only by default
    // (muster-armies §25.04), so the keyword list only carries the faction
    // keyword; the non-character rejection is applied by the universal
    // eligibility default (covered in armyList-store / legal-drop-slots specs).
    const meta = getEnhancementRestrictions("ADEPTA SORORITAS", "Eyes of the Oracle");
    expect(meta?.requiredKeywords).toEqual(["ADEPTA SORORITAS"]);

    // A CANONESS (ADEPTA SORORITAS) satisfies the keyword requirement.
    const canoness = new Set(["ADEPTA SORORITAS", "CHARACTER", "INFANTRY"]);
    expect(
      simulateAllowedHostsDisjunction(meta, "CANONESS", canoness)
    ).toBe(true);
  });

  it("Auramite Sarcophagus requires BOTH ADEPTUS CUSTODES and WALKER", () => {
    const meta = getEnhancementRestrictions(
      "ADEPTUS CUSTODES",
      "Auramite Sarcophagus"
    );
    expect(meta?.requiredKeywords).toEqual(["ADEPTUS CUSTODES", "WALKER"]);

    // Custodian Guard is ADEPTUS CUSTODES INFANTRY but not WALKER → reject
    const custodianGuard = new Set(["ADEPTUS CUSTODES", "INFANTRY"]);
    expect(
      simulateAllowedHostsDisjunction(meta, "CUSTODIAN GUARD", custodianGuard)
    ).toBe(false);

    // Venerable Contemptor Dreadnought is ADEPTUS CUSTODES + WALKER → pass
    const dreadnought = new Set(["ADEPTUS CUSTODES", "WALKER", "VEHICLE"]);
    expect(
      simulateAllowedHostsDisjunction(
        meta,
        "VENERABLE CONTEMPTOR DREADNOUGHT",
        dreadnought
      )
    ).toBe(true);
  });
});

describe("enhancement-restrictions — multi-host allowedHosts (OR-of-datasheets)", () => {
  // BSData's keyword→datasheet enumeration produces large allowedHosts
  // arrays. Each listed datasheet must independently satisfy the disjunction.

  it("Catechism of Divine Penitence accepts every listed host and rejects others", () => {
    const meta = getEnhancementRestrictions(
      "ADEPTA SORORITAS",
      "Catechism of Divine Penitence"
    );
    expect(meta?.allowedHosts?.length).toBeGreaterThanOrEqual(4);
    for (const host of meta.allowedHosts) {
      expect(
        simulateAllowedHostsDisjunction(meta, host, new Set())
      ).toBe(true);
    }
    // BATTLE SISTERS SQUAD is not in the list → reject
    expect(
      simulateAllowedHostsDisjunction(
        meta,
        "BATTLE SISTERS SQUAD",
        new Set(["ADEPTA SORORITAS", "BATTLELINE"])
      )
    ).toBe(false);
  });
});

describe("enhancement-restrictions — disjunction (allowedHosts OR requiredKeywords)", () => {
  // 87 entries in MFM-PDF populate both fields. The validator's `nameMatch ||
  // keywordMatch` means EITHER side passing is sufficient. Encircling Hunter
  // targets `allowedHosts: [KNIGHT-CENTURA]` OR `requiredKeywords:
  // [ANATHEMA PSYKANA]` — those are two distinct conditions, so we can
  // independently exercise each arm.

  it("Encircling Hunter passes via the name arm (KNIGHT-CENTURA, no ANATHEMA PSYKANA keyword)", () => {
    const meta = getEnhancementRestrictions(
      "ADEPTUS CUSTODES",
      "Encircling Hunter"
    );
    expect(meta?.allowedHosts).toEqual(["KNIGHT-CENTURA"]);
    expect(meta?.requiredKeywords).toEqual(["ANATHEMA PSYKANA"]);

    // Even with no ANATHEMA PSYKANA keyword, the name match alone passes.
    const hostKeywords = new Set(["INFANTRY", "CHARACTER"]);
    expect(
      simulateAllowedHostsDisjunction(meta, "KNIGHT-CENTURA", hostKeywords)
    ).toBe(true);
  });

  it("Encircling Hunter passes via the keyword arm (different datasheet name + ANATHEMA PSYKANA)", () => {
    const meta = getEnhancementRestrictions(
      "ADEPTUS CUSTODES",
      "Encircling Hunter"
    );

    // ALEYA isn't in allowedHosts, but has the ANATHEMA PSYKANA keyword.
    const aleya = new Set(["ANATHEMA PSYKANA", "CHARACTER", "EPIC HERO"]);
    expect(simulateAllowedHostsDisjunction(meta, "ALEYA", aleya)).toBe(true);
  });

  it("Encircling Hunter fails when NEITHER arm matches", () => {
    const meta = getEnhancementRestrictions(
      "ADEPTUS CUSTODES",
      "Encircling Hunter"
    );
    const custodianGuard = new Set(["ADEPTUS CUSTODES", "INFANTRY"]);
    expect(
      simulateAllowedHostsDisjunction(meta, "CUSTODIAN GUARD", custodianGuard)
    ).toBe(false);
  });
});
