import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { extractFactionData } from "../../scripts/scrape-mfm-11th/extract.mjs";
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
    });
  }

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
  });
});
