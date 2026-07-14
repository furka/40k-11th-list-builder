import { describe, it, expect } from "vitest";
import { computeListPoints } from "../utils/list-points";
import { getKeywordsFor } from "../data/keywords/index.js";
import { isBattleLine } from "../utils/is-battleline";
import { deserializeList } from "../utils/serialize-list";
import { load11thMFM } from "../data/munitorum-field-manual-11th/index.js";

// Regression coverage for two Discord-reported bugs when playing ADEPTUS
// CUSTODES with IMPERIAL AGENTS allied. Pinned to the committed game data on
// purpose (per the project's real-data-tests convention): if a future scrape
// changes these known-correct values, update the expectation to the new value.

const MFM = load11thMFM().CURRENT;

const findSheet = (faction, name) =>
  MFM.DATA_SHEETS.find((d) => d.faction === faction && d.name === name);

describe("Imperial Agents allied cost (Agents of the Imperium)", () => {
  it("carries both the standalone and allied point costs on the datasheet", () => {
    const draxus = findSheet("IMPERIAL AGENTS", "INQUISITOR DRAXUS");
    const tier = draxus.sizes[0].tiers[0];
    expect(tier.points).toBe(75); // standalone Imperial Agents army
    expect(tier.alliedPoints).toBe(110); // allied into another Imperium army
  });

  it("lists each Imperial Agents datasheet exactly once (no scraped duplicates)", () => {
    const names = MFM.DATA_SHEETS.filter(
      (d) => d.faction === "IMPERIAL AGENTS"
    ).map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("computeListPoints charges the allied cost only for allied units", () => {
    const list = {
      faction: "ADEPTUS CUSTODES",
      units: [
        {
          id: "ally",
          name: "INQUISITOR DRAXUS",
          optionName: "1 model",
          models: 1,
          allied: true,
          alliedFaction: "IMPERIAL AGENTS",
        },
      ],
      detachments: [],
    };
    const out = computeListPoints(list, MFM, "ADEPTUS CUSTODES");
    expect(out.perUnit.ally.points).toBe(110);
  });

  it("computeListPoints charges the standalone cost for a primary Imperial Agents army", () => {
    const list = {
      faction: "IMPERIAL AGENTS",
      units: [
        {
          id: "own",
          name: "INQUISITOR DRAXUS",
          optionName: "1 model",
          models: 1,
        },
      ],
      detachments: [],
    };
    const out = computeListPoints(list, MFM, "IMPERIAL AGENTS");
    expect(out.perUnit.own.points).toBe(75);
  });
});

describe("Custodian Guard BATTLELINE", () => {
  it("resolves BATTLELINE for plain Custodian Guard (faction-pack borrow dropped)", () => {
    expect(getKeywordsFor("ADEPTUS CUSTODES", "CUSTODIAN GUARD")).toContain(
      "BATTLELINE"
    );
    expect(isBattleLine(findSheet("ADEPTUS CUSTODES", "CUSTODIAN GUARD"))).toBe(
      true
    );
  });

  it("does not make the spear variant BATTLELINE", () => {
    const spear = findSheet(
      "ADEPTUS CUSTODES",
      "CUSTODIAN GUARD WITH ADRASITE AND PYRITHITE SPEARS"
    );
    expect(isBattleLine(spear)).toBe(false);
  });
});

describe("the reported shared list, end to end", () => {
  // Custodes primary + Imperial Agents ally, mirroring the Discord report:
  // an allied INQUISITOR DRAXUS and a CUSTODIAN GUARD.
  const params = new URLSearchParams();
  params.set("f", "ADEPTUS CUSTODES");
  params.set("m", "2000");
  params.set("mfm", "V1.0");
  params.set("al", "IMPERIAL AGENTS");
  params.append("un", "INQUISITOR DRAXUS");
  params.append("um", "1");
  params.append("ua", "1");
  params.append("uaf", "IMPERIAL AGENTS");
  params.append("un", "CUSTODIAN GUARD");
  params.append("um", "5");
  params.append("ua", "");
  params.append("uaf", "");

  it("charges the allied Draxus the Agents-of-the-Imperium cost (110, not 75)", () => {
    const list = deserializeList(params);
    const draxus = list.units.find((u) => u.name === "INQUISITOR DRAXUS");
    expect(draxus.allied).toBe(true);
    const out = computeListPoints(list, MFM, list.faction);
    expect(out.perUnit[draxus.id].points).toBe(110);
  });
});
