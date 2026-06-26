import { describe, it, expect } from "vitest";
import { normalizeResult } from "./llm-classify-errata-keywords.mjs";

describe("normalizeResult (errata extraction shape)", () => {
  it("uppercases + dedupes add/remove and keeps multi-datasheet lists", () => {
    const out = normalizeResult({
      changes: [
        {
          datasheets: ["Exorcist", "Immolator", "Sororitas Rhino"],
          add: ["frame", "Frame"],
          remove: [],
        },
        { datasheets: ["Warlock Conclave"], add: [], remove: ["character"] },
      ],
    });
    expect(out.changes).toEqual([
      {
        datasheets: ["Exorcist", "Immolator", "Sororitas Rhino"],
        add: ["FRAME"],
        remove: [],
      },
      { datasheets: ["Warlock Conclave"], add: [], remove: ["CHARACTER"] },
    ]);
  });

  it("drops changes with no datasheets or no add/remove, and tolerates junk", () => {
    const out = normalizeResult({
      changes: [
        { datasheets: [], add: ["FRAME"], remove: [] }, // no datasheets
        { datasheets: ["Heldrake"], add: [], remove: [] }, // no change
        null,
        { datasheets: ["Trygon"], add: ["VANGUARD INVADER"] }, // missing remove
      ],
    });
    expect(out.changes).toEqual([
      { datasheets: ["Trygon"], add: ["VANGUARD INVADER"], remove: [] },
    ]);
  });

  it("returns empty changes for malformed input", () => {
    expect(normalizeResult(null)).toEqual({ changes: [] });
    expect(normalizeResult({})).toEqual({ changes: [] });
  });
});
