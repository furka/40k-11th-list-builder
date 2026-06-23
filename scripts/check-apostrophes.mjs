#!/usr/bin/env node
// Verification helper: scan all JSON data files for non-canonical apostrophe
// variants. Reports any hits and exits non-zero so CI can catch regressions.
// Idempotent companion to scripts/migrate-apostrophes.mjs.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const VARIANTS = [
  { ch: "'", name: "U+0027 (straight ASCII)" },
  { ch: "‘", name: "U+2018 (leading curly)" },
  { ch: "ʼ", name: "U+02BC (modifier letter apostrophe)" },
  { ch: "ʻ", name: "U+02BB (modifier letter turned comma)" },
];

function walkJson(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJson(full));
    else if (e.isFile() && e.name.endsWith(".json")) out.push(full);
  }
  return out;
}

const roots = [
  resolve(REPO_ROOT, "src", "data", "configs"),
  resolve(REPO_ROOT, "src", "data", "keywords"),
  resolve(REPO_ROOT, "src", "data", "munitorum-field-manual-11th"),
];

const files = roots.flatMap((r) => {
  try {
    return walkJson(r);
  } catch {
    return [];
  }
});

let hits = 0;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const v of VARIANTS) {
    if (text.includes(v.ch)) {
      console.log(`${f}: contains ${v.name}`);
      hits++;
    }
  }
}

console.log(
  `\nFiles checked: ${files.length}, non-canonical-apostrophe hits: ${hits}`
);
process.exit(hits === 0 ? 0 : 1);
