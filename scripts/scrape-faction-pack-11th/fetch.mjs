import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, ".cache");
const PDF_CACHE_DIR = resolve(CACHE_DIR, "faction-packs");
const POLITE_DELAY_MS = 1000;

let lastFetchAt = 0;

async function politeDelay() {
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < POLITE_DELAY_MS) {
    await new Promise((r) => setTimeout(r, POLITE_DELAY_MS - elapsed));
  }
  lastFetchAt = Date.now();
}

async function ensurePdfCacheDir() {
  if (!existsSync(PDF_CACHE_DIR)) {
    await mkdir(PDF_CACHE_DIR, { recursive: true });
  }
}

export async function fetchFactionPackPdf(slug, url, { refresh = false } = {}) {
  await ensurePdfCacheDir();
  const cachePath = resolve(PDF_CACHE_DIR, `${slug}.pdf`);
  if (!refresh && existsSync(cachePath)) {
    return readFile(cachePath);
  }
  await politeDelay();
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "40k-list-builder-scraper/1.0 (https://github.com/furka/40k-11th-list-builder)",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(cachePath, buf);
  return buf;
}

export function pdfCachePathFor(slug) {
  return resolve(PDF_CACHE_DIR, `${slug}.pdf`);
}
