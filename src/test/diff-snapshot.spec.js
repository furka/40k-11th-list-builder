import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { diffSnapshots } from "../../scripts/scrape-mfm-11th/diff-snapshot.mjs";
import { resolveSnapshotStateSync } from "../../scripts/scrape-mfm-11th/snapshot-resolve.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MFM_ROOT = resolve(__dirname, "../data/munitorum-field-manual-11th");

// Both snapshots are archived, so these assertions stay valid as current/ moves on.
const PRIOR = "v1.4-2026-09-02";
const NEXT = "v1.5-2026-09-30";

function load(name) {
  return new Map(Object.entries(resolveSnapshotStateSync(MFM_ROOT, { upTo: name }).factions));
}

function factionSection(md, faction) {
  const start = md.indexOf(`### ${faction}\n`);
  if (start === -1) return "";
  const end = md.indexOf("\n### ", start + 1);
  return md.slice(start, end === -1 ? undefined : end);
}

describe("diffSnapshots — v1.4 → v1.5", () => {
  const md = diffSnapshots(load(PRIOR), load(NEXT), {
    siteVersion: "V1.5",
    scrapedAt: "2026-09-30",
    priorDirName: PRIOR,
  });

  it("still reports datasheet points changes", () => {
    expect(factionSection(md, "SPACE MARINES")).toContain("ANCIENT\n  - 1 model: **40 → 45** ↑ (+5)");
  });

  it("reports enhancement points changes", () => {
    expect(factionSection(md, "ORKS")).toContain("enhancement Targetin’ Gizmos: **10 → 25** ↑ (+15)");
  });

  it("reports detachment DP changes", () => {
    const admech = factionSection(md, "ADEPTUS MECHANICUS");
    expect(admech).toMatch(/\*\*COHORT CYBERNETICA\*\*\n\s+- DP: \*\*2 → 1\*\*/);
  });

  it("reports detachment tag changes", () => {
    const ba = factionSection(md, "BLOOD ANGELS");
    expect(ba).toMatch(/\*\*ANGELIC INHERITORS\*\*\n\s+- tags: - UNIQUE: GRACE/);
  });

  it("reports new detachments", () => {
    expect(factionSection(md, "SPACE MARINES")).toContain("**+ NEW detachment** ASSAULT BRETHREN");
  });
});

describe("diffSnapshots — order-only changes", () => {
  it("ignores reordered attachesTo and tags", () => {
    const prior = load(NEXT);
    const worldEaters = structuredClone(prior.get("world-eaters"));
    for (const d of worldEaters.detachments) {
      d.leader?.attachesTo?.reverse();
      d.tags?.reverse();
    }
    for (const s of worldEaters.datasheets) s.leader?.attachesTo?.reverse();
    const next = new Map(prior).set("world-eaters", worldEaters);

    expect(diffSnapshots(prior, next, { priorDirName: NEXT })).toContain(
      "No datasheet, points, or detachment changes."
    );
  });
});
