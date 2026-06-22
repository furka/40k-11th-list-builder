import { describe, it, expect } from "vitest";
import { serializeList, deserializeList } from "../utils/serialize-list";

const buildUnit = (overrides) => ({
  id: overrides.id ?? `u-${Math.random().toString(36).slice(2, 8)}`,
  name: "NECRON WARRIORS",
  optionName: "10 models",
  models: 10,
  points: 80,
  ...overrides,
});

function urlSearchParamsFromHash(serialized) {
  return new URLSearchParams(serialized.slice(1));
}

describe("serializeList / deserializeList", () => {
  it("preserves base fields and units round-trip", () => {
    const data = {
      name: "My Army",
      faction: "NECRONS",
      maxPoints: 2000,
      mfm_version: "V1.0 (2026-06-17)",
      version: "1.0.0",
      detachments: ["AWAKENED DYNASTY"],
      units: [buildUnit({ id: "a" }), buildUnit({ id: "b", points: 80 })],
    };

    const out = serializeList(data);
    const restored = deserializeList(urlSearchParamsFromHash(out));

    expect(restored.name).toBe("My Army");
    expect(restored.faction).toBe("NECRONS");
    expect(restored.maxPoints).toBe(2000);
    expect(restored.mfm_version).toBe("V1.0 (2026-06-17)");
    expect(restored.detachments).toEqual(["AWAKENED DYNASTY"]);
    expect(restored.units.length).toBe(2);
    expect(restored.units[0].name).toBe("NECRON WARRIORS");
  });

  it("mints fresh IDs for deserialised units", () => {
    const data = {
      units: [buildUnit({ id: "a" }), buildUnit({ id: "b" })],
    };
    const restored = deserializeList(
      urlSearchParamsFromHash(serializeList(data))
    );
    expect(restored.units[0].id).toBeTruthy();
    expect(restored.units[1].id).toBeTruthy();
    expect(restored.units[0].id).not.toBe(restored.units[1].id);
    // IDs are regenerated — not the original "a" / "b"
    expect(restored.units[0].id).not.toBe("a");
  });

  it("preserves attachedTo relationships via index rehydration", () => {
    const data = {
      units: [
        buildUnit({ id: "host", name: "NECRON WARRIORS" }),
        buildUnit({
          id: "leader",
          name: "IMOTEKH",
          attachedTo: "host",
          models: 1,
          points: 100,
        }),
        buildUnit({
          id: "enh",
          name: "Enhancements",
          optionName: "Veil of Darkness",
          attachedTo: "leader",
          points: 25,
        }),
      ],
    };

    const out = serializeList(data);
    const restored = deserializeList(urlSearchParamsFromHash(out));

    expect(restored.units.length).toBe(3);
    const [host, leader, enh] = restored.units;
    expect(host.attachedTo).toBeUndefined();
    expect(leader.attachedTo).toBe(host.id);
    expect(enh.attachedTo).toBe(leader.id);
  });

  it("emits attachedTo as the host's array index", () => {
    const data = {
      units: [
        buildUnit({ id: "a" }),
        buildUnit({ id: "b" }),
        buildUnit({ id: "c", attachedTo: "b" }),
      ],
    };
    const out = serializeList(data);
    const params = urlSearchParamsFromHash(out);
    // Third `uat` slot (third unit) should be the host's array index ("1" for unit b)
    expect(params.getAll("uat")).toEqual(["", "", "1"]);
  });

  it("deserialises legacy URLs without `uat` params — every unit lands at root", () => {
    const params = new URLSearchParams();
    // Mimic a legacy share URL that only had the original four unit fields
    params.append("un", encodeURIComponent("NECRON WARRIORS"));
    params.append("un", encodeURIComponent("IMOTEKH"));
    params.append("um", encodeURIComponent("10"));
    params.append("um", encodeURIComponent("1"));
    params.append("uon", encodeURIComponent("10 models"));
    params.append("uon", encodeURIComponent("1 model"));
    params.append("up", encodeURIComponent("80"));
    params.append("up", encodeURIComponent("100"));

    const restored = deserializeList(params);
    expect(restored.units.length).toBe(2);
    for (const u of restored.units) {
      expect(u.attachedTo).toBeUndefined();
      expect(u.id).toBeTruthy();
    }
  });

  it("orphans an attachedTo pointing at a missing host on deserialise", () => {
    const params = new URLSearchParams();
    params.append("un", encodeURIComponent("IMOTEKH"));
    params.append("um", encodeURIComponent("1"));
    params.append("uon", encodeURIComponent("1 model"));
    params.append("up", encodeURIComponent("100"));
    // Reference an out-of-range index
    params.append("uat", encodeURIComponent("99"));

    const restored = deserializeList(params);
    expect(restored.units.length).toBe(1);
    expect(restored.units[0].attachedTo).toBeUndefined();
  });

  it("preserves the allies array round-trip", () => {
    const data = {
      name: "Mixed Forces",
      faction: "CHAOS KNIGHTS",
      maxPoints: 2000,
      allies: ["CHAOS DAEMONS", "CHAOS SPACE MARINES"],
      units: [],
    };
    const restored = deserializeList(
      urlSearchParamsFromHash(serializeList(data))
    );
    expect(restored.allies).toEqual([
      "CHAOS DAEMONS",
      "CHAOS SPACE MARINES",
    ]);
  });

  it("preserves the per-unit allied flag and alliedFaction round-trip", () => {
    const data = {
      faction: "CHAOS KNIGHTS",
      allies: ["CHAOS DAEMONS"],
      units: [
        buildUnit({ id: "primary", name: "WAR DOG KARNIVORE", points: 130 }),
        buildUnit({
          id: "ally",
          name: "BLOODLETTERS",
          points: 110,
          allied: true,
          alliedFaction: "CHAOS DAEMONS",
        }),
      ],
    };
    const restored = deserializeList(
      urlSearchParamsFromHash(serializeList(data))
    );
    const [primary, ally] = restored.units;
    expect(primary.allied).toBeUndefined();
    expect(primary.alliedFaction).toBeUndefined();
    expect(ally.allied).toBe(true);
    expect(ally.alliedFaction).toBe("CHAOS DAEMONS");
  });

  it("treats a missing allied param as not-allied (legacy URLs)", () => {
    const params = new URLSearchParams();
    params.append("un", encodeURIComponent("WAR DOG KARNIVORE"));
    params.append("um", encodeURIComponent("1"));
    params.append("uon", encodeURIComponent("1 model"));
    params.append("up", encodeURIComponent("130"));

    const restored = deserializeList(params);
    expect(restored.units[0].allied).toBeUndefined();
  });

  it("preserves bonusBattleline round-trip including names with commas and apostrophes", () => {
    const data = {
      faction: "ORKS",
      // Datasheet names that exist in MFM and contain tricky characters:
      // "WARRIOR BIOFORM ONSLAUGHT" → no special chars but mixed case
      // Simulated "ORDO HERETICUS, PURGATION FORCE" → comma
      // Simulated "SERPENT'S BROOD" → apostrophe
      bonusBattleline: [
        "WARBIKERS",
        "ORDO HERETICUS, PURGATION FORCE",
        "SERPENT'S BROOD",
      ],
      units: [],
    };
    const restored = deserializeList(
      urlSearchParamsFromHash(serializeList(data))
    );
    expect(restored.bonusBattleline).toEqual([
      "WARBIKERS",
      "ORDO HERETICUS, PURGATION FORCE",
      "SERPENT'S BROOD",
    ]);
  });

  it("preserves wargear pseudo-units round-trip (parentDataSheet + attachedTo)", () => {
    const data = {
      units: [
        buildUnit({ id: "host", name: "FIELD ORDNANCE BATTERY", models: 2 }),
        {
          id: "wgr",
          name: "Wargear",
          parentDataSheet: "FIELD ORDNANCE BATTERY",
          optionName: "Bombast field gun",
          attachedTo: "host",
        },
      ],
    };

    const restored = deserializeList(
      urlSearchParamsFromHash(serializeList(data))
    );

    expect(restored.units.length).toBe(2);
    const [host, wargear] = restored.units;
    expect(wargear.name).toBe("Wargear");
    expect(wargear.parentDataSheet).toBe("FIELD ORDNANCE BATTERY");
    expect(wargear.optionName).toBe("Bombast field gun");
    expect(wargear.attachedTo).toBe(host.id);
  });
});
