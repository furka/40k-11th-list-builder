import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_ROOT = resolve(__dirname, ".cache");
const RAW_BASE = "https://raw.githubusercontent.com/BSData/wh40k-11e";
const POLITE_DELAY_MS = 1000;

// Sentinel written to the cache when upstream returned 404, so a re-run
// against the same pinned tag stays a fast cache-hit instead of replaying
// the failed network call. Not valid JSON, so it can never be mistaken for a
// real catalogue payload — callers must compare against MISSING_MARKER before
// attempting to parse.
const MISSING_MARKER = "// bsdata-missing\n";

let lastFetchAt = 0;

async function politeDelay() {
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < POLITE_DELAY_MS) {
    await new Promise((r) => setTimeout(r, POLITE_DELAY_MS - elapsed));
  }
  lastFetchAt = Date.now();
}

// Returns the catalogue JSON text, or null if the file doesn't exist at the
// pinned ref (typically a file present in an older mapping but not in the
// current BSData tree). Cache is keyed by ref so bumping the pinned commit
// invalidates every entry without manual cleanup.
export async function fetchCatFile(tag, filename, { refresh = false } = {}) {
  const cacheDir = resolve(CACHE_ROOT, tag);
  if (!existsSync(cacheDir)) {
    await mkdir(cacheDir, { recursive: true });
  }
  const cachePath = resolve(cacheDir, filename);

  if (!refresh && existsSync(cachePath)) {
    const cached = await readFile(cachePath, "utf8");
    return cached === MISSING_MARKER ? null : cached;
  }

  await politeDelay();
  const url = `${RAW_BASE}/${tag}/${encodeURIComponent(filename)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "40k-list-builder-bsdata/1.0 (https://github.com/furka/40k-11th-list-builder)",
    },
  });
  if (res.status === 404) {
    await writeFile(cachePath, MISSING_MARKER, "utf8");
    return null;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const json = await res.text();
  await writeFile(cachePath, json, "utf8");
  return json;
}
