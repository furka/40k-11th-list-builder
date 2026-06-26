#!/usr/bin/env node
/**
 * Decide whether the BSData scrapers produced a *real* change, ignoring the
 * volatile metadata header (`_sha`/`_committedAt`/`_generatedAt`/...) every
 * scraper stamps on each run.
 *
 * The scrapers always rewrite their output with a fresh header even when the
 * extracted payload is byte-identical, so a plain `git status` would open a
 * noisy PR every time BSData's `main` branch advances. Here we compare each
 * watched file's payload (header stripped) against the committed version and
 * only report `changed=true` when actual data differs.
 *
 * Outputs (to $GITHUB_OUTPUT when set, otherwise logged to stdout):
 *   changed       — "true" iff at least one file changed after stripping metadata
 *   sha / short   — upstream BSData commit the scrape resolved to
 *   committed     — upstream commit's committer date
 *   metadata_only — space-separated files that differ on disk but only in metadata
 *                   (the workflow reverts these so they never pollute the PR)
 */
import { readFileSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const WATCHED_FILES = [
  "src/data/keywords/bsdata-keywords.auto.json",
  "src/data/configs/enhancement-restrictions.bsdata.auto.json",
  "src/data/configs/wargear-restrictions.bsdata.auto.json",
  "src/data/keywords/manual-overrides.json",
];

const KEYWORDS_FILE = "src/data/keywords/bsdata-keywords.auto.json";

const METADATA_KEYS = new Set([
  "_source",
  "_ref",
  "_sha",
  "_committedAt",
  "_generatedAt",
  "_generator",
]);

function stripMetadata(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (METADATA_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

// Order-insensitive serialization so key reordering or whitespace differences
// don't register as a change — only the actual values matter.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonical(value[key]);
    return sorted;
  }
  return value;
}

function canonicalString(obj) {
  return JSON.stringify(canonical(stripMetadata(obj)));
}

function readWorkingTree(relPath) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relPath), "utf8"));
}

function readHead(relPath) {
  try {
    const json = execSync(`git show HEAD:${relPath}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(json);
  } catch {
    return null; // absent in HEAD → treat as a real change
  }
}

const realChanged = [];
const metadataOnly = [];

for (const file of WATCHED_FILES) {
  const head = readHead(file);
  if (head === null) {
    realChanged.push(file);
    continue;
  }

  const working = readWorkingTree(file);
  if (canonicalString(working) !== canonicalString(head)) {
    realChanged.push(file);
  } else if (JSON.stringify(working) !== JSON.stringify(head)) {
    metadataOnly.push(file);
  }
}

const keywords = readWorkingTree(KEYWORDS_FILE);
const sha = keywords._sha ?? "";
const short = sha.slice(0, 8);
const committed = keywords._committedAt ?? "";
const changed = realChanged.length > 0;

console.log(`Real changes (${realChanged.length}):`);
for (const f of realChanged) console.log(`  ✔ ${f}`);
console.log(`Metadata-only churn (${metadataOnly.length}):`);
for (const f of metadataOnly) console.log(`  ~ ${f}`);
console.log(`Resolved BSData SHA: ${short} (committed ${committed})`);
console.log(changed ? "→ opening/updating PR" : "→ no real change, skipping PR");

const outputs = {
  changed: String(changed),
  sha,
  short,
  committed,
  metadata_only: metadataOnly.join(" "),
};

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n"
  );
}
