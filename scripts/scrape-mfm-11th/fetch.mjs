import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const BASE_URL = "https://mfm.warhammer-community.com/en";
const POLITE_DELAY_MS = 1000;

let lastFetchAt = 0;

async function politeDelay() {
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < POLITE_DELAY_MS) {
    await new Promise((r) => setTimeout(r, POLITE_DELAY_MS - elapsed));
  }
  lastFetchAt = Date.now();
}

async function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true });
  }
}

// CI restores this cache dir from the prior run's actions/cache entry, which
// is keyed on the scraper source hash and therefore stays valid (and gets
// restored) indefinitely while the scraper code is unchanged. Without a TTL,
// a scheduled run would keep reading the very first cached HTML forever and
// never notice new MFM data. Same-day reuse is still allowed, since that's
// what the cache is for (politeness / re-run resilience within a run).
async function isCacheFresh(cachePath) {
  const { mtime } = await stat(cachePath);
  return mtime.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

// `legends: true` adds the `isLegendsDisplayed=true` cookie, which the MFM
// server reads to include Legends datasheets in its render. Without the
// cookie those units are omitted entirely. Cached separately as
// `<slug>.legends.html` so both variants persist for offline diffing.
export async function fetchFactionHtml(
  slug,
  { refresh = false, legends = false } = {}
) {
  await ensureCacheDir();
  const cacheName = legends ? `${slug}.legends.html` : `${slug}.html`;
  const cachePath = resolve(CACHE_DIR, cacheName);

  if (!refresh && existsSync(cachePath) && (await isCacheFresh(cachePath))) {
    return readFile(cachePath, "utf8");
  }

  await politeDelay();
  const url = `${BASE_URL}/${slug}`;
  const headers = {
    "User-Agent":
      "40k-list-builder-scraper/1.0 (https://github.com/furka/40k-11th-list-builder)",
  };
  if (legends) headers.Cookie = "isLegendsDisplayed=true";
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const html = await res.text();
  await writeFile(cachePath, html, "utf8");
  return html;
}

export function cachePathFor(slug, { legends = false } = {}) {
  return resolve(CACHE_DIR, legends ? `${slug}.legends.html` : `${slug}.html`);
}
