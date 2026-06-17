import { describe, it, expect } from "vitest";
import {
  isEnhancementUnit,
  isWargearUnit,
  attachedToError,
} from "../utils/attachment-rules";

const SHEETS = {
  "NECRON WARRIORS": { name: "NECRON WARRIORS", battleLine: true },
  IMOTEKH: {
    name: "IMOTEKH",
    character: true,
    leader: { attachesTo: ["IMMORTALS", "LYCHGUARD", "NECRON WARRIORS"] },
  },
  CHRONOMANCER: {
    name: "CHRONOMANCER",
    character: true,
    support: { attachesTo: ["IMMORTALS", "NECRON WARRIORS"] },
  },
  IMMORTALS: { name: "IMMORTALS" },
  LYCHGUARD: { name: "LYCHGUARD" },
  DOOMSDAY_ARK: { name: "DOOMSDAY ARK" },
  Enhancements: { name: "Enhancements", enhancements: true },
};
const getDataSheet = (name) => SHEETS[name] ?? null;

const unit = (name, extras = {}) => ({
  id: extras.id ?? name.toLowerCase(),
  name,
  ...extras,
});

describe("isEnhancementUnit", () => {
  it("returns true for units with name === 'Enhancements'", () => {
    expect(isEnhancementUnit({ name: "Enhancements" })).toBe(true);
  });
  it("returns false for normal units", () => {
    expect(isEnhancementUnit({ name: "NECRON WARRIORS" })).toBe(false);
    expect(isEnhancementUnit({ name: "IMOTEKH" })).toBe(false);
  });
});

describe("attachedToError", () => {
  it("returns null for units with no attachedTo", () => {
    expect(attachedToError(unit("IMOTEKH"), null, getDataSheet)).toBeNull();
  });

  it("returns an error if the host is missing entirely", () => {
    expect(
      attachedToError(
        { ...unit("IMOTEKH"), attachedTo: "ghost" },
        null,
        getDataSheet
      )
    ).toBe("Attached to a missing unit");
  });

  it("returns an error for a Leader attached to a host NOT in attachesTo", () => {
    const err = attachedToError(
      { ...unit("IMOTEKH"), attachedTo: "x" },
      unit("DOOMSDAY ARK"),
      getDataSheet
    );
    expect(err).toMatch(/Leader can only attach to:/);
    expect(err).toContain("IMMORTALS");
  });

  it("returns null for a Leader attached to a valid host", () => {
    expect(
      attachedToError(
        { ...unit("IMOTEKH"), attachedTo: "x" },
        unit("NECRON WARRIORS"),
        getDataSheet
      )
    ).toBeNull();
  });

  it("returns an error for a Support attached to a host NOT in attachesTo", () => {
    const err = attachedToError(
      { ...unit("CHRONOMANCER"), attachedTo: "x" },
      unit("LYCHGUARD"),
      getDataSheet
    );
    expect(err).toMatch(/Support can only attach to:/);
  });

  it("returns null for an Enhancement attached anywhere", () => {
    expect(
      attachedToError(
        { name: "Enhancements", optionName: "Veil", attachedTo: "x" },
        unit("IMOTEKH"),
        getDataSheet
      )
    ).toBeNull();
  });

  it("returns an error for a regular unit that's attached", () => {
    const err = attachedToError(
      { ...unit("NECRON WARRIORS"), attachedTo: "x" },
      unit("IMOTEKH"),
      getDataSheet
    );
    expect(err).toBe("This unit can't be attached to another");
  });
});

describe("isWargearUnit", () => {
  it("returns true only for units with name === 'Wargear'", () => {
    expect(isWargearUnit({ name: "Wargear" })).toBe(true);
    expect(isWargearUnit({ name: "Enhancements" })).toBe(false);
    expect(isWargearUnit({ name: "NECRON WARRIORS" })).toBe(false);
    expect(isWargearUnit(null)).toBe(false);
  });
});

describe("attachedToError — wargear", () => {
  const wargear = (parentDataSheet, attachedTo = "host") => ({
    name: "Wargear",
    parentDataSheet,
    optionName: "Bombast field gun",
    attachedTo,
  });

  it("returns null when host's datasheet matches parentDataSheet", () => {
    expect(
      attachedToError(
        wargear("NECRON WARRIORS"),
        unit("NECRON WARRIORS"),
        getDataSheet
      )
    ).toBeNull();
  });

  it("returns 'Wargear belongs to …' when the host's datasheet does NOT match", () => {
    expect(
      attachedToError(wargear("NECRON WARRIORS"), unit("IMOTEKH"), getDataSheet)
    ).toBe("Wargear belongs to NECRON WARRIORS");
  });

  it("flags a missing host", () => {
    expect(
      attachedToError(wargear("NECRON WARRIORS"), null, getDataSheet)
    ).toBe("Attached to a missing unit");
  });
});
