import { describe, it, expect } from "vitest";

import {
  normalizeApostrophes,
  normalizeApostrophesDeep,
} from "../utils/apostrophe-normalization";

const CANONICAL = "’"; // ’
const STRAIGHT = "'"; // '
const LEADING = "‘"; // ‘
const MODIFIER_APOSTROPHE = "ʼ"; // ʼ
const MODIFIER_TURNED_COMMA = "ʻ"; // ʻ

describe("normalizeApostrophes", () => {
  it("returns the canonical U+2019 unchanged", () => {
    expect(normalizeApostrophes("C’TAN")).toBe("C’TAN");
  });

  it("collapses ASCII U+0027 to canonical", () => {
    const input = `HELL${STRAIGHT}S LAST`;
    const out = normalizeApostrophes(input);
    expect(out).toBe(`HELL${CANONICAL}S LAST`);
    expect(out.includes(STRAIGHT)).toBe(false);
  });

  it("collapses leading curly U+2018 to canonical", () => {
    const input = `${LEADING}IRON HAND${CANONICAL} STRAKEN`;
    const out = normalizeApostrophes(input);
    expect(out).toBe(`${CANONICAL}IRON HAND${CANONICAL} STRAKEN`);
    expect(out.includes(LEADING)).toBe(false);
  });

  it("collapses modifier letter apostrophe U+02BC", () => {
    expect(normalizeApostrophes(`T${MODIFIER_APOSTROPHE}AU EMPIRE`)).toBe(
      `T${CANONICAL}AU EMPIRE`
    );
  });

  it("collapses modifier letter turned comma U+02BB", () => {
    expect(normalizeApostrophes(`O${MODIFIER_TURNED_COMMA}AHU`)).toBe(
      `O${CANONICAL}AHU`
    );
  });

  it("handles multiple mixed variants in one string", () => {
    const input = `${LEADING}IRON HAND${CANONICAL} STRAKEN${STRAIGHT}S CREW`;
    expect(normalizeApostrophes(input)).toBe(
      `${CANONICAL}IRON HAND${CANONICAL} STRAKEN${CANONICAL}S CREW`
    );
  });

  it("leaves strings without apostrophes alone", () => {
    expect(normalizeApostrophes("ADEPTA SORORITAS")).toBe("ADEPTA SORORITAS");
    expect(normalizeApostrophes("")).toBe("");
  });

  it("passes through non-strings unchanged", () => {
    expect(normalizeApostrophes(null)).toBe(null);
    expect(normalizeApostrophes(undefined)).toBe(undefined);
    expect(normalizeApostrophes(42)).toBe(42);
    expect(normalizeApostrophes(true)).toBe(true);
  });
});

describe("normalizeApostrophesDeep", () => {
  it("normalizes strings inside nested objects", () => {
    const input = {
      NECRONS: {
        "Quantum Goad": {
          allowedHosts: [`C${STRAIGHT}TAN SHARD OF THE NIGHTBRINGER`],
        },
      },
    };
    const out = normalizeApostrophesDeep(input);
    expect(out.NECRONS["Quantum Goad"].allowedHosts).toEqual([
      `C${CANONICAL}TAN SHARD OF THE NIGHTBRINGER`,
    ]);
  });

  it("normalizes object keys too (enhancement-name-keyed maps)", () => {
    const input = {
      [`Khaine${STRAIGHT}s Wrath`]: { points: 25 },
    };
    const out = normalizeApostrophesDeep(input);
    expect(Object.keys(out)).toEqual([`Khaine${CANONICAL}s Wrath`]);
    expect(out[`Khaine${CANONICAL}s Wrath`]).toEqual({ points: 25 });
  });

  it("walks arrays recursively", () => {
    const input = [
      `GAUNT${STRAIGHT}S GHOSTS`,
      [`HELL${STRAIGHT}S LAST`, `${LEADING}IRON HAND${CANONICAL} STRAKEN`],
    ];
    const out = normalizeApostrophesDeep(input);
    expect(out).toEqual([
      `GAUNT${CANONICAL}S GHOSTS`,
      [`HELL${CANONICAL}S LAST`, `${CANONICAL}IRON HAND${CANONICAL} STRAKEN`],
    ]);
  });

  it("doesn't mutate the input", () => {
    const input = {
      enh: [`C${STRAIGHT}TAN`],
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    normalizeApostrophesDeep(input);
    expect(input).toEqual(snapshot);
  });

  it("preserves number/boolean/null leaves untouched", () => {
    const input = { a: 1, b: true, c: null, d: `T${STRAIGHT}AU` };
    expect(normalizeApostrophesDeep(input)).toEqual({
      a: 1,
      b: true,
      c: null,
      d: `T${CANONICAL}AU`,
    });
  });

  it("is idempotent — running twice produces the same result", () => {
    const input = {
      faction: `T${STRAIGHT}AU`,
      enh: { [`Khaine${STRAIGHT}s Wrath`]: [`${LEADING}IRON HAND${CANONICAL}`] },
    };
    const once = normalizeApostrophesDeep(input);
    const twice = normalizeApostrophesDeep(once);
    expect(twice).toEqual(once);
  });
});
