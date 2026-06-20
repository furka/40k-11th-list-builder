import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useCodexStore } from "../stores/codex";
import { useMfmStore } from "../stores/mfm";
import { useAppStore } from "../stores/app";

const PRIMARY = "CHAOS KNIGHTS";
const ALLY = "CHAOS DAEMONS";
const OTHER = "AELDARI";

const TEST_MFM = {
  EDITION: "11th",
  MFM_VERSION: "V1.0 (test)",
  FACTIONS: [
    {
      name: PRIMARY,
      detachments: [
        { name: "TRAITORIS LANCE", dp: 2, role: null, leader: null, tags: [], enhancements: [] },
      ],
    },
    {
      name: ALLY,
      detachments: [
        { name: "DAEMONIC INCURSION", dp: 2, role: null, leader: null, tags: [], enhancements: [] },
      ],
    },
    {
      name: OTHER,
      detachments: [
        { name: "BATTLE HOST", dp: 2, role: null, leader: null, tags: [], enhancements: [] },
      ],
    },
  ],
  DATA_SHEETS: [
    {
      name: "WAR DOG KARNIVORE",
      faction: PRIMARY,
      sizes: [{ name: "1 model", models: 1, basePoints: 130, tiers: [{ minCount: 1, points: 130 }] }],
    },
    {
      name: "BLOODLETTERS",
      faction: ALLY,
      sizes: [{ name: "10 models", models: 10, basePoints: 110, tiers: [{ minCount: 1, points: 110 }] }],
    },
    {
      name: "GUARDIANS",
      faction: OTHER,
      sizes: [{ name: "10 models", models: 10, basePoints: 100, tiers: [{ minCount: 1, points: 100 }] }],
    },
  ],
};

function freshStores() {
  setActivePinia(createPinia());
  const mfm = useMfmStore();
  mfm.MFM = { CURRENT: TEST_MFM, [TEST_MFM.MFM_VERSION]: TEST_MFM };
  const codex = useCodexStore();
  const app = useAppStore();
  codex.setFaction(PRIMARY);
  codex.setCurrentMFM(TEST_MFM);
  return { codex, app };
}

describe("codex.filteredCompendium with allies", () => {
  let codex, app;
  beforeEach(() => {
    ({ codex, app } = freshStores());
  });

  it("returns only primary datasheets when no allies are set", () => {
    const names = codex.filteredCompendium.map((s) => s.name);
    expect(names).toEqual(["WAR DOG KARNIVORE"]);
  });

  it("includes datasheets from allied factions", () => {
    codex.setAllies([ALLY]);
    const names = codex.filteredCompendium.map((s) => s.name).sort();
    expect(names).toEqual(["BLOODLETTERS", "WAR DOG KARNIVORE"]);
  });

  it("tags allied datasheets with allied + alliedFaction", () => {
    codex.setAllies([ALLY]);
    const bloodletters = codex.filteredCompendium.find(
      (s) => s.name === "BLOODLETTERS"
    );
    expect(bloodletters.allied).toBe(true);
    expect(bloodletters.alliedFaction).toBe(ALLY);
  });

  it("does NOT tag primary datasheets as allied", () => {
    codex.setAllies([ALLY]);
    const wardog = codex.filteredCompendium.find(
      (s) => s.name === "WAR DOG KARNIVORE"
    );
    expect(wardog.allied).toBeUndefined();
    expect(wardog.alliedFaction).toBeUndefined();
  });

  it("does NOT include datasheets from non-allied factions", () => {
    codex.setAllies([ALLY]);
    const names = codex.filteredCompendium.map((s) => s.name);
    expect(names).not.toContain("GUARDIANS");
  });

  it("supports multiple allied factions", () => {
    codex.setAllies([ALLY, OTHER]);
    const names = codex.filteredCompendium.map((s) => s.name).sort();
    expect(names).toEqual(["BLOODLETTERS", "GUARDIANS", "WAR DOG KARNIVORE"]);
  });

  it("does not mutate the underlying compendium datasheet", () => {
    codex.setAllies([ALLY]);
    // Force re-evaluation
    void codex.filteredCompendium;
    const raw = codex.compendium.find((s) => s.name === "BLOODLETTERS");
    expect(raw.allied).toBeUndefined();
    expect(raw.alliedFaction).toBeUndefined();
  });
});

describe("codex.filteredDetachments with allies", () => {
  let codex;
  beforeEach(() => {
    ({ codex } = freshStores());
  });

  it("only returns primary-faction detachments even when allies are set", () => {
    codex.setAllies([ALLY]);
    const names = codex.filteredDetachments.map((d) => d.name);
    expect(names).toEqual(["TRAITORIS LANCE"]);
  });
});
