import { describe, it, expect } from "vitest";
import {
  sortDataSheetAlphabetical,
  sortListByRole,
  sortListPoints,
  sortTree,
} from "../utils/sort-functions";

const unit = (id, name, attachedTo, extra = {}) =>
  attachedTo === undefined
    ? { id, name, ...extra }
    : { id, name, attachedTo, ...extra };

const makeGetDataSheet = (sheets) => (name) => sheets[name] ?? null;

const makeMfmStore = (pointsByName) => ({
  getPoints: (u) => pointsByName[u.name] ?? 0,
});

describe("sortTree", () => {
  it("returns empty array for empty input", () => {
    expect(sortTree([], sortDataSheetAlphabetical)).toEqual([]);
  });

  it("returns a single root unchanged", () => {
    const units = [unit("1", "Alpha")];
    expect(sortTree(units, sortDataSheetAlphabetical)).toEqual(units);
  });

  it("flattens parent + child in pre-order regardless of input array order", () => {
    const child = unit("c", "Child", "h");
    const host = unit("h", "Host");
    const result = sortTree([child, host], sortDataSheetAlphabetical);
    expect(result.map((u) => u.id)).toEqual(["h", "c"]);
  });

  it("preserves [A, A-child, B] when sorting two roots with a child under A", () => {
    const units = [
      unit("a", "Apple"),
      unit("ac", "Apricot", "a"),
      unit("b", "Banana"),
    ];
    const result = sortTree(units, sortDataSheetAlphabetical);
    expect(result.map((u) => u.id)).toEqual(["a", "ac", "b"]);
  });

  it("treats an orphan child with a missing host as root", () => {
    const units = [unit("a", "Alpha"), unit("o", "Orphan", "missing")];
    const result = sortTree(units, sortDataSheetAlphabetical);
    expect(result.map((u) => u.id)).toEqual(["a", "o"]);
  });

  it("sorts children of one parent independently of root order", () => {
    const units = [
      unit("a", "Alpha"),
      unit("a2", "Zebra", "a"),
      unit("a1", "Aardvark", "a"),
      unit("b", "Beta"),
    ];
    const result = sortTree(units, sortDataSheetAlphabetical);
    expect(result.map((u) => u.id)).toEqual(["a", "a1", "a2", "b"]);
  });

  it("supports nested grandchildren (depth 2)", () => {
    const units = [
      unit("h", "Host"),
      unit("c", "Child", "h"),
      unit("g", "Grandchild", "c"),
    ];
    const result = sortTree(units, sortDataSheetAlphabetical);
    expect(result.map((u) => u.id)).toEqual(["h", "c", "g"]);
  });
});

describe("sortDataSheetAlphabetical via sortTree", () => {
  it("sorts 3 roots alphabetically", () => {
    const units = [
      unit("1", "Zebra"),
      unit("2", "Apple"),
      unit("3", "Mantis"),
    ];
    const result = sortTree(units, sortDataSheetAlphabetical);
    expect(result.map((u) => u.name)).toEqual(["Apple", "Mantis", "Zebra"]);
  });

  it("sorts children within their host and keeps host at its root slot", () => {
    const units = [
      unit("c", "Captain"),
      unit("v", "Veil of Darkness", "c"),
      unit("a", "Aegis", "c"),
    ];
    const result = sortTree(units, sortDataSheetAlphabetical);
    expect(result.map((u) => u.name)).toEqual([
      "Captain",
      "Aegis",
      "Veil of Darkness",
    ]);
  });

  it("does not promote a child that sorts alphabetically before all roots", () => {
    // "Aardvark" attached to "Beta" must stay nested under Beta — not float
    // to the front of the flat list as if it were a root.
    const units = [
      unit("h", "Beta"),
      unit("c", "Aardvark", "h"),
      unit("r", "Charlie"),
    ];
    const result = sortTree(units, sortDataSheetAlphabetical);
    expect(result.map((u) => u.name)).toEqual(["Beta", "Aardvark", "Charlie"]);
  });
});

describe("sortListPoints — group-aware via sortTree", () => {
  it("sorts a Captain+Enhancement group by its total points (Cheap first)", () => {
    // Captain (100) + Enhancement (25) = group 125; Squad 110; Tank 150
    const units = [
      unit("cap", "Captain"),
      unit("enh", "Enhancement", "cap"),
      unit("squad", "Squad"),
      unit("tank", "Tank"),
    ];
    const mfmStore = makeMfmStore({
      Captain: 100,
      Enhancement: 25,
      Squad: 110,
      Tank: 150,
    });
    const cmp = sortListPoints(mfmStore, {}, units, true);
    const result = sortTree(units, cmp);
    expect(result.map((u) => u.id)).toEqual(["squad", "cap", "enh", "tank"]);
  });

  it("sorts a Captain+Enhancement group by its total points (Expensive first)", () => {
    const units = [
      unit("cap", "Captain"),
      unit("enh", "Enhancement", "cap"),
      unit("squad", "Squad"),
      unit("tank", "Tank"),
    ];
    const mfmStore = makeMfmStore({
      Captain: 100,
      Enhancement: 25,
      Squad: 110,
      Tank: 150,
    });
    const cmp = sortListPoints(mfmStore, {}, units, false);
    const result = sortTree(units, cmp);
    expect(result.map((u) => u.id)).toEqual(["tank", "cap", "enh", "squad"]);
  });

  it("sums deeper subtrees: Captain + Lieutenant + Enhancement = 205", () => {
    const units = [
      unit("cap", "Captain"),
      unit("lt", "Lieutenant", "cap"),
      unit("enh", "Enhancement", "cap"),
      unit("squad", "Squad"),
    ];
    const mfmStore = makeMfmStore({
      Captain: 100,
      Lieutenant: 80,
      Enhancement: 25,
      Squad: 110,
    });
    // Group=205 sorts above Squad=110 when expensive-first.
    const expensive = sortTree(
      units,
      sortListPoints(mfmStore, {}, units, false)
    );
    expect(expensive[0].id).toBe("cap");
    // And below Squad when cheap-first.
    const cheap = sortTree(units, sortListPoints(mfmStore, {}, units, true));
    expect(cheap[0].id).toBe("squad");
  });

  it("sorts children among themselves by their own group total", () => {
    const units = [
      unit("h", "Host"),
      unit("e", "Enhancement", "h"),
      unit("l", "Leader", "h"),
    ];
    const mfmStore = makeMfmStore({ Host: 200, Enhancement: 25, Leader: 80 });
    const cheap = sortTree(units, sortListPoints(mfmStore, {}, units, true));
    expect(cheap.map((u) => u.id)).toEqual(["h", "e", "l"]);
    const expensive = sortTree(
      units,
      sortListPoints(mfmStore, {}, units, false)
    );
    expect(expensive.map((u) => u.id)).toEqual(["h", "l", "e"]);
  });

  it("falls back to alphabetical on a points tie", () => {
    const units = [unit("z", "Zebra"), unit("a", "Apple")];
    const mfmStore = makeMfmStore({ Zebra: 100, Apple: 100 });
    const cmp = sortListPoints(mfmStore, {}, units, true);
    expect(sortTree(units, cmp).map((u) => u.name)).toEqual([
      "Apple",
      "Zebra",
    ]);
  });
});

describe("sortListByRole via sortTree", () => {
  // Stand-in datasheets keyed by name. Mirrors the shape codexStore.getDataSheet
  // returns: only the role flags read by sortListByRole are present.
  const sheets = {
    "Lone Captain": { keywords: ["CHARACTER"] },
    "Standalone Enhancement": { enhancements: true },
    "Servitor Drone": { support: true },
    "Intercessor Squad": { keywords: ["BATTLELINE"] },
    Captain: { leader: true },
    Lieutenant: { leader: true },
    Veil: { enhancements: true },
  };
  const getDataSheet = makeGetDataSheet(sheets);

  it("smoke test: roots-only list sorts by role priority", () => {
    const units = [
      unit("battle", "Intercessor Squad"),
      unit("support", "Servitor Drone"),
      unit("enh", "Standalone Enhancement"),
      unit("char", "Lone Captain"),
    ];
    const result = sortTree(units, sortListByRole(getDataSheet));
    expect(result.map((u) => u.id)).toEqual([
      "char",
      "enh",
      "support",
      "battle",
    ]);
  });

  it("does not promote an attached Captain above its battle-line host", () => {
    // The standalone Lone Captain sorts ahead of the Squad (character beats
    // battle-line), but the Captain attached to the Squad stays nested under
    // it — its leader priority is irrelevant at the root level.
    const units = [
      unit("squad", "Intercessor Squad"),
      unit("attached", "Captain", "squad"),
      unit("standalone", "Lone Captain"),
    ];
    const result = sortTree(units, sortListByRole(getDataSheet));
    expect(result.map((u) => u.id)).toEqual(["standalone", "squad", "attached"]);
  });

  it("keeps attached enhancements nested under their host", () => {
    // Without tree-aware sorting, the Enhancement (priority 2) would float
    // ahead of the battle-line Squad (priority 4) in a flat sort. Here it
    // stays under its Captain host.
    const units = [
      unit("cap", "Lone Captain"),
      unit("enh", "Veil", "cap"),
      unit("squad", "Intercessor Squad"),
    ];
    const result = sortTree(units, sortListByRole(getDataSheet));
    expect(result.map((u) => u.id)).toEqual(["cap", "enh", "squad"]);
  });

  it("within a host: leaders (priority 1) sort before enhancements (priority 2)", () => {
    const units = [
      unit("h", "Intercessor Squad"),
      unit("enh", "Veil", "h"),
      unit("lt", "Lieutenant", "h"),
    ];
    const result = sortTree(units, sortListByRole(getDataSheet));
    expect(result.map((u) => u.id)).toEqual(["h", "lt", "enh"]);
  });
});
