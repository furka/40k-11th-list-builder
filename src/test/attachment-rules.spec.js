import { describe, it, expect } from "vitest";
import {
  isEnhancementUnit,
  isWargearUnit,
  attachedToError,
  attachedUnitRootId,
  countEnhancementsInAttachedUnit,
} from "../utils/attachment-rules";

const SHEETS = {
  "NECRON WARRIORS": { name: "NECRON WARRIORS", keywords: ["BATTLELINE"] },
  IMOTEKH: {
    name: "IMOTEKH",
    keywords: ["CHARACTER"],
    leader: { attachesTo: ["IMMORTALS", "LYCHGUARD", "NECRON WARRIORS"] },
  },
  CHRONOMANCER: {
    name: "CHRONOMANCER",
    keywords: ["CHARACTER"],
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

describe("attachedUnitRootId", () => {
  const u = (id, attachedTo) => ({ id, name: "X", attachedTo });

  it("returns the unit's own id when it has no attachedTo", () => {
    const a = u("a");
    expect(attachedUnitRootId(a, [a])).toBe("a");
  });

  it("walks up via attachedTo to the topmost ancestor", () => {
    const root = u("root");
    const mid = u("mid", "root");
    const leaf = u("leaf", "mid");
    expect(attachedUnitRootId(leaf, [root, mid, leaf])).toBe("root");
  });

  it("treats a missing attachedTo target as the chain's end", () => {
    const leaf = u("leaf", "ghost");
    expect(attachedUnitRootId(leaf, [leaf])).toBe("leaf");
  });

  it("is cycle-safe", () => {
    const a = u("a", "b");
    const b = u("b", "a");
    // No infinite loop; returns something (the exact endpoint is implementation
    // detail of where the seen set short-circuits).
    expect(["a", "b"]).toContain(attachedUnitRootId(a, [a, b]));
  });
});

describe("countEnhancementsInAttachedUnit", () => {
  const u = (id, attachedTo) => ({ id, name: "NECRON WARRIORS", attachedTo });
  const e = (id, attachedTo) => ({
    id,
    name: "Enhancements",
    optionName: "X",
    attachedTo,
  });

  it("counts an enhancement directly attached to the root", () => {
    const root = u("root");
    const enh = e("e1", "root");
    expect(countEnhancementsInAttachedUnit("root", [root, enh])).toBe(1);
  });

  it("counts enhancements anywhere in the attached-unit subtree", () => {
    // root (squad) ← mid (leader) ← enhancement
    const root = u("root");
    const mid = u("mid", "root");
    const enh = e("e1", "mid");
    expect(countEnhancementsInAttachedUnit("root", [root, mid, enh])).toBe(1);
  });

  it("sums multiple enhancements across the tree", () => {
    const root = u("root");
    const leader = u("leader", "root");
    const enhOnLeader = e("ea", "leader");
    const enhOnRoot = e("eb", "root");
    expect(
      countEnhancementsInAttachedUnit("root", [
        root,
        leader,
        enhOnLeader,
        enhOnRoot,
      ])
    ).toBe(2);
  });

  it("excludes a specified id (self-exemption for drop-time legality)", () => {
    const root = u("root");
    const enh = e("e1", "root");
    expect(
      countEnhancementsInAttachedUnit("root", [root, enh], "e1")
    ).toBe(0);
  });

  it("returns 0 when rootId is missing", () => {
    expect(countEnhancementsInAttachedUnit(null, [])).toBe(0);
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
