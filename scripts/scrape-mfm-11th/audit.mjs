// Post-hoc audit of the scrape pipeline. Reads the structured warnings log
// written by the last `npm run mfm:scrape` and groups them by category for
// quick human review.
//
// Run with: `node scripts/scrape-mfm-11th/audit.mjs`
//
// If the warnings log doesn't exist yet (no scrape has run since the file
// was introduced), the script prints a one-line hint and exits clean.

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WARNINGS_PATH = resolve(__dirname, ".cache/_warnings.json");

if (!existsSync(WARNINGS_PATH)) {
  console.log(
    `No warnings log found at ${WARNINGS_PATH}.\n` +
      `Run \`npm run mfm:scrape\` first; the audit reads its output.`
  );
  process.exit(0);
}

const payload = JSON.parse(readFileSync(WARNINGS_PATH, "utf8"));
const { label, scrapedAt, warnings, counts } = payload;

console.log(`Audit of \`${label}\` run at ${scrapedAt}`);
console.log(`${warnings.length} warning(s) total.\n`);

if (warnings.length === 0) {
  console.log("Nothing to audit. The last scrape was clean.");
  process.exit(0);
}

// Group warnings by category, then by faction slug within each category.
const byCat = {};
for (const w of warnings) {
  (byCat[w.category] ??= []).push(w);
}

for (const cat of Object.keys(byCat).sort()) {
  const list = byCat[cat];
  console.log(`=== ${cat} (${list.length}) ===`);
  const byFaction = {};
  for (const w of list) (byFaction[w.slug ?? "(no slug)"] ??= []).push(w);
  for (const slug of Object.keys(byFaction).sort()) {
    const entries = byFaction[slug];
    console.log(`  ${slug}:`);
    for (const e of entries) {
      const detailKeys = Object.keys(e).filter((k) => k !== "category" && k !== "slug");
      const detail = detailKeys
        .map((k) => {
          const v = e[k];
          if (typeof v === "string" && v.length > 120) return `${k}: ${v.slice(0, 120)}…`;
          if (Array.isArray(v)) return `${k}: [${v.join(", ")}]`;
          return `${k}: ${v}`;
        })
        .join("  ");
      console.log(`     ${detail}`);
    }
  }
  console.log();
}

console.log("Summary counts:");
for (const [cat, n] of Object.entries(counts).sort()) {
  console.log(`  ${cat.padEnd(28)} ${n}`);
}
