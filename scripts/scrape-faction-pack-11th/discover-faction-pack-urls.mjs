import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FACTION_SLUGS } from "../scrape-mfm-11th/factions.mjs";
import { createWarningSink } from "../scrape-mfm-11th/warnings.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const OUT_PATH = resolve(__dirname, "faction-pack-urls.json");
const DOWNLOADS_URL = "https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/";

// Manual aliases for the cases where the GW link text doesn't match a faction
// slug verbatim. Keys are normalised (lowercase, hyphenated) versions of the
// link text or its surrounding label; values are the official faction slug
// used by the existing MFM scrape.
const LINK_TEXT_TO_SLUG = {
  "adepta-sororitas": "adepta-sororitas",
  "adeptus-custodes": "adeptus-custodes",
  "adeptus-mechanicus": "adeptus-mechanicus",
  "aeldari": "aeldari",
  "astra-militarum": "astra-militarum",
  "black-templars": "black-templars",
  "blood-angels": "blood-angels",
  "chaos-daemons": "chaos-daemons",
  "chaos-knights": "chaos-knights",
  "chaos-space-marines": "chaos-space-marines",
  "dark-angels": "dark-angels",
  "death-guard": "death-guard",
  "deathwatch": "deathwatch",
  "drukhari": "drukhari",
  "emperors-children": "emperors-children",
  "emperor-s-children": "emperors-children",
  "genestealer-cults": "genestealer-cults",
  "grey-knights": "grey-knights",
  "imperial-agents": "imperial-agents",
  "imperial-knights": "imperial-knights",
  "leagues-of-votann": "leagues-of-votann",
  "necrons": "necrons",
  "orks": "orks",
  "space-marines": "space-marines",
  "space-wolves": "space-wolves",
  "t-au-empire": "tau-empire",
  "tau-empire": "tau-empire",
  "thousand-sons": "thousand-sons",
  "tyranids": "tyranids",
  "world-eaters": "world-eaters",
};

function normalize(s) {
  // GW labels its Faction Pack PDFs with the link text "Faction Pack: <Name>".
  // Strip that prefix before normalising so "Faction Pack: Space Marines"
  // collapses to "space-marines" rather than "faction-pack-space-marines".
  const stripped = s.replace(/^\s*faction\s*pack\s*:?\s*/i, "");
  return stripped.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Faction Pack PDFs hosted on assets.warhammer-community.com encode their
// upload date in the filename as `eng_DD-MM_…`. We need to pick the most
// recent URL per faction because the downloads page lists BOTH old (legacy
// 10th-edition) and new (current 11th-edition) packs under identical link
// text ("Faction Pack: <Faction>"). Without date-based selection we'd
// non-deterministically pick whichever happened to appear later in the DOM.
//
// Year inference: GW filenames carry only DD-MM, no year. Any date that
// would be in the future under the current year is one year older.
const URL_DATE_RE = /eng_(\d{1,2})-(\d{1,2})_/;

function parseUrlDate(url, now = new Date()) {
  const m = url.match(URL_DATE_RE);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(dd) || !Number.isFinite(mm)) return null;
  const todayY = now.getUTCFullYear();
  const todayM = now.getUTCMonth() + 1;
  const todayD = now.getUTCDate();
  let year = todayY;
  if (mm > todayM || (mm === todayM && dd > todayD)) year = todayY - 1;
  return year * 10000 + mm * 100 + dd;
}

async function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true });
}

async function main() {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug");

  await ensureCacheDir();

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      "40k-list-builder-scraper/1.0 (https://github.com/furka/40k-11th-list-builder)",
  });
  const page = await ctx.newPage();

  console.log(`Opening ${DOWNLOADS_URL} …`);
  await page.goto(DOWNLOADS_URL, { waitUntil: "networkidle", timeout: 60000 });

  // Faction Pack PDFs are surfaced under a "Faction Packs" tab/section. The
  // page lazy-renders accordions; wait until at least one .pdf anchor shows
  // up before harvesting.
  await page.waitForFunction(
    () => document.querySelectorAll('a[href$=".pdf"]').length > 0,
    null,
    { timeout: 30000 }
  ).catch(() => {});

  const anchors = await page.$$eval("a", (els) =>
    els
      .map((a) => ({ href: a.href, text: (a.textContent || "").trim() }))
      .filter((a) => a.href.toLowerCase().endsWith(".pdf"))
  );

  if (debug) {
    const all = await page.$$eval("a", (els) =>
      els.map((a) => ({ href: a.href, text: (a.textContent || "").trim() }))
    );
    await writeFile(
      resolve(CACHE_DIR, "_downloads-anchors.json"),
      JSON.stringify(all, null, 2),
      "utf8"
    );
    const html = await page.content();
    await writeFile(resolve(CACHE_DIR, "_downloads-rendered.html"), html, "utf8");
    console.log(`Dumped ${all.length} anchors + rendered HTML to .cache/`);
  }

  await browser.close();

  console.log(`Found ${anchors.length} PDF anchor(s).`);

  // Map each PDF to a faction slug by matching the link text (or surrounding
  // label) against LINK_TEXT_TO_SLUG. The downloads page lists multiple
  // generations of each Faction Pack under the same link text, so collect
  // ALL matching anchors per slug and pick the most recent by URL date.
  const candidates = {};
  const unclassified = [];
  for (const a of anchors) {
    const norm = normalize(a.text);
    const slug = LINK_TEXT_TO_SLUG[norm];
    if (!slug) {
      unclassified.push(a);
      continue;
    }
    const date = parseUrlDate(a.href);
    if (date === null) continue; // can't decide recency; skip safely
    if (!candidates[slug]) candidates[slug] = [];
    candidates[slug].push({ href: a.href, date });
  }

  const bySlug = {};
  for (const [slug, list] of Object.entries(candidates)) {
    list.sort((a, b) => b.date - a.date);
    bySlug[slug] = list[0].href;
  }

  const warnings = createWarningSink("discover-faction-pack-urls");
  for (const slug of FACTION_SLUGS) {
    if (!bySlug[slug]) warnings.add("pdf-url-missing", { slug });
  }
  for (const a of unclassified) {
    warnings.add("pdf-url-unclassified", { text: a.text, href: a.href });
  }

  await writeFile(OUT_PATH, JSON.stringify(bySlug, null, 2) + "\n", "utf8");
  console.log(`Wrote ${Object.keys(bySlug).length} slug -> URL mapping(s) to ${OUT_PATH}`);

  const payload = await warnings.flush();
  if (payload.warnings.length > 0) {
    console.log(`\n${payload.warnings.length} warning(s) written to .cache/_warnings.json:`);
    for (const [cat, n] of Object.entries(payload.counts).sort()) {
      console.log(`  ${cat.padEnd(28)} ${n}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
