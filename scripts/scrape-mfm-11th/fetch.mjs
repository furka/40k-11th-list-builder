import { readFile, writeFile, mkdir } from "node:fs/promises";
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

export async function fetchFactionHtml(slug, { refresh = false } = {}) {
  await ensureCacheDir();
  const cachePath = resolve(CACHE_DIR, `${slug}.html`);

  if (!refresh && existsSync(cachePath)) {
    return readFile(cachePath, "utf8");
  }

  await politeDelay();
  const url = `${BASE_URL}/${slug}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "40k-list-builder-scraper/1.0 (https://github.com/furka/40k-10th-list-builder)",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const html = await res.text();
  await writeFile(cachePath, html, "utf8");
  return html;
}

export function cachePathFor(slug) {
  return resolve(CACHE_DIR, `${slug}.html`);
}
