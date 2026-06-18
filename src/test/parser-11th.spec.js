import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractFactionData,
  parseEnhancementName,
} from "../../scripts/scrape-mfm-11th/extract.mjs";
import { normalizeFactionData } from "../../scripts/scrape-mfm-11th/normalize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, "fixtures-11th");

const FIXTURES = [
  { slug: "necrons", factionName: "NECRONS" },
  { slug: "space-marines", factionName: "SPACE MARINES" },
  { slug: "aeldari", factionName: "AELDARI" },
];

describe("11th edition scraper — extract + normalize", () => {
  for (const { slug, factionName } of FIXTURES) {
    describe(slug, () => {
      const html = readFileSync(resolve(FIXTURES_DIR, `${slug}.html`), "utf8");

      it("extracts a non-empty data set with the right site version", () => {
        const data = extractFactionData(html);
        expect(data.siteVersion).toBe("v1.0");
        expect(data.detachments.length).toBeGreaterThan(0);
        expect(data.datasheets.length).toBeGreaterThan(0);
      });

      it("each detachment has a name, integer DP, and at least one enhancement", () => {
        const data = extractFactionData(html);
        for (const d of data.detachments) {
          expect(d.name).toBeTruthy();
          expect(Number.isInteger(d.dp)).toBe(true);
          expect(d.dp).toBeGreaterThanOrEqual(1);
          expect(d.dp).toBeLessThanOrEqual(3);
          expect(d.enhancements.length).toBeGreaterThan(0);
          for (const e of d.enhancements) {
            expect(e.name).toBeTruthy();
            expect(typeof e.points).toBe("number");
          }
        }
      });

      it("every datasheet has at least one tier with at least one priced option", () => {
        const data = extractFactionData(html);
        for (const ds of data.datasheets) {
          expect(ds.name).toBeTruthy();
          expect(ds.tiers.length).toBeGreaterThan(0);
          for (const tier of ds.tiers) {
            expect(tier.options.length).toBeGreaterThan(0);
            for (const opt of tier.options) {
              expect(typeof opt.points).toBe("number");
            }
          }
        }
      });

      it("normalizes tier-major options into size-major tiered sizes", () => {
        const raw = extractFactionData(html);
        const normalized = normalizeFactionData(slug, factionName, raw);
        expect(normalized.faction).toBe(factionName);

        for (const ds of normalized.datasheets) {
          expect(ds.sizes.length).toBeGreaterThan(0);
          for (const size of ds.sizes) {
            expect(size.tiers.length).toBeGreaterThan(0);
            // Tiers must be ascending by minCount
            for (let i = 1; i < size.tiers.length; i++) {
              expect(size.tiers[i].minCount).toBeGreaterThan(
                size.tiers[i - 1].minCount
              );
            }
          }
        }
      });

      it("wargear options, when present, parse as { name, points } pairs", () => {
        const data = extractFactionData(html);
        for (const ds of data.datasheets) {
          if (!ds.wargearOptions) continue;
          expect(ds.wargearOptions.length).toBeGreaterThan(0);
          for (const wo of ds.wargearOptions) {
            expect(typeof wo.name).toBe("string");
            expect(wo.name.length).toBeGreaterThan(0);
            expect(typeof wo.points).toBe("number");
            expect(wo.points).toBeGreaterThan(0);
          }
        }
      });

      it("datasheets without WARGEAR OPTIONS omit the field entirely", () => {
        // Keep the schema lean: we don't materialize empty arrays. The
        // runtime reader treats absent and empty as the same; preserving
        // that here avoids needless diff churn on every scrape.
        const data = extractFactionData(html);
        for (const ds of data.datasheets) {
          if ("wargearOptions" in ds) {
            expect(ds.wargearOptions.length).toBeGreaterThan(0);
          }
        }
      });

      it("normalize passes wargearOptions straight through", () => {
        const raw = extractFactionData(html);
        const normalized = normalizeFactionData(slug, factionName, raw);
        for (const rawSheet of raw.datasheets) {
          if (!rawSheet.wargearOptions) continue;
          const normSheet = normalized.datasheets.find(
            (d) => d.name === rawSheet.name
          );
          expect(normSheet.wargearOptions).toEqual(rawSheet.wargearOptions);
        }
      });
    });
  }

  describe("space-marines — locked WARGEAR OPTIONS sample", () => {
    // The space-marines fixture has exactly one datasheet with wargear options
    // (a Redemptor/Macro variant). Pin the parse so a future refactor of
    // extract.mjs doesn't silently regress wargear detection across factions.
    const data = (() => {
      const html = readFileSync(
        resolve(FIXTURES_DIR, "space-marines.html"),
        "utf8"
      );
      return normalizeFactionData(
        "space-marines",
        "SPACE MARINES",
        extractFactionData(html)
      );
    })();

    it("at least one datasheet carries wargearOptions", () => {
      const withWargear = data.datasheets.filter((d) => d.wargearOptions);
      expect(withWargear.length).toBeGreaterThan(0);
    });

    it("the 'Macro plasma incinerator' option parses with the 'per ' prefix stripped", () => {
      // Lock the canonical sample from the fixture (REDEMPTOR DREADNOUGHT).
      // The MFM writes "per Macro plasma incinerator …10 pts"; the scraper
      // drops the presentational "per " so the bare name is stored.
      const hosts = data.datasheets.filter((d) =>
        d.wargearOptions?.some((w) => /macro plasma incinerator/i.test(w.name))
      );
      expect(hosts.length).toBe(1);
      const wo = hosts[0].wargearOptions.find((w) =>
        /macro plasma incinerator/i.test(w.name)
      );
      expect(wo.name).toBe("Macro plasma incinerator");
      expect(typeof wo.points).toBe("number");
    });
  });

  describe("necrons — locked behavior on canonical units", () => {
    const data = (() => {
      const html = readFileSync(resolve(FIXTURES_DIR, "necrons.html"), "utf8");
      return normalizeFactionData("necrons", "NECRONS", extractFactionData(html));
    })();

    it("NECRON WARRIORS is flat-priced with two sizes", () => {
      const ds = data.datasheets.find((d) => d.name === "NECRON WARRIORS");
      expect(ds.sizes.map((s) => s.models)).toEqual([10, 20]);
      for (const size of ds.sizes) {
        expect(size.tiers.length).toBe(1);
        expect(size.tiers[0].minCount).toBe(1);
        expect(size.tiers[0].maxCount).toBeUndefined();
      }
    });

    it("MONOLITH is tiered (1st vs 2nd+)", () => {
      const ds = data.datasheets.find((d) => d.name === "MONOLITH");
      expect(ds.sizes.length).toBe(1);
      const tiers = ds.sizes[0].tiers;
      expect(tiers.length).toBe(2);
      expect(tiers[0]).toMatchObject({ minCount: 1, maxCount: 1 });
      expect(tiers[1]).toMatchObject({ minCount: 2 });
      expect(tiers[1].maxCount).toBeUndefined();
      expect(tiers[1].points).toBeGreaterThan(tiers[0].points);
    });

    it("DOOMSDAY ARK is tiered (1st-2nd vs 3rd+)", () => {
      const ds = data.datasheets.find((d) => d.name === "DOOMSDAY ARK");
      const tiers = ds.sizes[0].tiers;
      expect(tiers.length).toBe(2);
      expect(tiers[0]).toMatchObject({ minCount: 1, maxCount: 2 });
      expect(tiers[1]).toMatchObject({ minCount: 3 });
    });

    it("IMOTEKH THE STORMLORD has Leader attaches-to", () => {
      const ds = data.datasheets.find((d) => d.name === "IMOTEKH THE STORMLORD");
      expect(ds.leader).toEqual({
        attachesTo: ["IMMORTALS", "LYCHGUARD", "NECRON WARRIORS"],
      });
      expect(ds.support).toBeNull();
    });

    it("CHRONOMANCER has Support attaches-to and is tiered", () => {
      const ds = data.datasheets.find((d) => d.name === "CHRONOMANCER");
      expect(ds.support).not.toBeNull();
      expect(ds.support.attachesTo.length).toBeGreaterThan(0);
      expect(ds.sizes[0].tiers.length).toBe(2);
    });

    it("AWAKENED DYNASTY detachment has 3DP and 4 enhancements", () => {
      const raw = extractFactionData(
        readFileSync(resolve(FIXTURES_DIR, "necrons.html"), "utf8")
      );
      const det = raw.detachments.find((d) => d.name === "AWAKENED DYNASTY");
      expect(det.dp).toBe(3);
      expect(det.enhancements.length).toBe(4);
    });

    it("each detachment has a role with the official name + color", () => {
      const det = (name) => data.detachments.find((d) => d.name === name);
      // PURGE THE FOE = #8B1B1B (dark red)
      expect(det("ANNIHILATION LEGION").role).toEqual({
        name: "PURGE THE FOE",
        color: "#8B1B1B",
      });
      // TAKE AND HOLD = #2E6B3E (dark green)
      expect(det("AWAKENED DYNASTY").role).toEqual({
        name: "TAKE AND HOLD",
        color: "#2E6B3E",
      });
      // RECONNAISSANCE = #008080 (teal)
      expect(det("HYPERCRYPT LEGION").role).toEqual({
        name: "RECONNAISSANCE",
        color: "#008080",
      });
      // PRIORITY ASSETS = #B8860A (dark gold)
      expect(det("CRYPTEK CONCLAVE").role).toEqual({
        name: "PRIORITY ASSETS",
        color: "#B8860A",
      });
      // DISRUPTION = #1A3A5C (dark blue)
      expect(det("OBEISANCE PHALANX").role).toEqual({
        name: "DISRUPTION",
        color: "#1A3A5C",
      });
    });

    it("CURSED LEGION exposes a detachment-level LEADER block", () => {
      const det = data.detachments.find((d) => d.name === "CURSED LEGION");
      expect(det.leader).not.toBeNull();
      expect(det.leader.attachesTo).toEqual([
        "LOKHUST DESTROYERS",
        "SKORPEKH DESTROYERS",
        "LOKHUST HEAVY DESTROYERS",
        "OPHYDIAN DESTROYERS",
      ]);
    });

    it("AWAKENED DYNASTY has no detachment-level LEADER block", () => {
      const det = data.detachments.find((d) => d.name === "AWAKENED DYNASTY");
      expect(det.leader).toBeNull();
    });

    it("UNIQUE tags survive through normalize", () => {
      const det = data.detachments.find((d) => d.name === "HYPERCRYPT LEGION");
      expect(det.tags).toContain("UNIQUE: HYPERCRYPT");
    });

    it("(Upgrade)-suffixed enhancements get nonCharacterOnly:true and clean names", () => {
      // The Necron fixtures include unit-upgrade enhancements. Verify the
      // scraper strips the suffix from `name` and sets the flag.
      const upgrades = [];
      const plain = [];
      for (const det of data.detachments) {
        for (const enh of det.enhancements) {
          if (enh.nonCharacterOnly) upgrades.push(enh);
          else plain.push(enh);
          expect(enh.name).not.toMatch(/\(upgrade\)\s*$/i);
        }
      }
      expect(upgrades.length).toBeGreaterThan(0);
      expect(plain.length).toBeGreaterThan(0);
    });
  });
});

describe("parseEnhancementName", () => {
  it("strips trailing (Upgrade) and sets nonCharacterOnly", () => {
    expect(parseEnhancementName("Enlivened Sentinels (Upgrade)")).toEqual({
      name: "Enlivened Sentinels",
      nonCharacterOnly: true,
    });
  });

  it("returns the original name with nonCharacterOnly: false when no suffix", () => {
    expect(parseEnhancementName("Dimensional Overseer")).toEqual({
      name: "Dimensional Overseer",
      nonCharacterOnly: false,
    });
  });

  it("is case-insensitive on the suffix", () => {
    expect(parseEnhancementName("Foo (upgrade)").nonCharacterOnly).toBe(true);
    expect(parseEnhancementName("Foo (UPGRADE)").nonCharacterOnly).toBe(true);
    expect(parseEnhancementName("Foo (Upgrade)").nonCharacterOnly).toBe(true);
  });

  it("does NOT strip when 'Upgrade' appears mid-name", () => {
    expect(parseEnhancementName("Upgrade of the Ancients")).toEqual({
      name: "Upgrade of the Ancients",
      nonCharacterOnly: false,
    });
    expect(parseEnhancementName("An (Upgrade) in the middle")).toEqual({
      name: "An (Upgrade) in the middle",
      nonCharacterOnly: false,
    });
  });

  it("tolerates extra surrounding whitespace before the suffix", () => {
    expect(parseEnhancementName("Foo   (Upgrade)  ")).toEqual({
      name: "Foo",
      nonCharacterOnly: true,
    });
  });

  it("defensively handles non-string input", () => {
    expect(parseEnhancementName(undefined)).toEqual({
      name: "",
      nonCharacterOnly: false,
    });
    expect(parseEnhancementName(null)).toEqual({
      name: "",
      nonCharacterOnly: false,
    });
  });
});
