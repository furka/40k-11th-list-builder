// Shared helpers for the dependency-review agent: repo-root resolution,
// source-file walking, and the import-detection regex. Kept dependency-free so
// the reviewer can run after `npm ci --ignore-scripts` without pulling anything
// the app doesn't already ship.

import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "../..");

const CODE_EXTS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".vue",
  ".html",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-ssr",
  "coverage",
  ".git",
  ".cache",
  ".claude",
]);

export function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches how a module is pulled in, including subpath imports
// ("pdfjs-dist/legacy/build/pdf.mjs"): static `from "pkg"`, bare `import "pkg"`,
// dynamic `import("pkg")`, and `require("pkg")`. Non-global so `.test()` is
// stateless across calls.
export function importRegex(pkg) {
  const p = escapeRegExp(pkg);
  return new RegExp(
    `(?:from|import|require)\\s*\\(?\\s*["'\`]${p}(?:/[^"'\`]*)?["'\`]`
  );
}

// Yields absolute paths of code files under `startPath`. Accepts a directory
// (walked recursively, skipping build/vendor dirs) or a single file (yielded
// as-is regardless of extension, so callers can target vite.config.js).
export async function* walkFiles(startPath, { exts = CODE_EXTS } = {}) {
  if (!existsSync(startPath)) return;
  const st = await stat(startPath);
  if (st.isFile()) {
    yield startPath;
    return;
  }
  const entries = await readdir(startPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkFiles(join(startPath, entry.name), { exts });
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf(".");
      const ext = dot >= 0 ? entry.name.slice(dot) : "";
      if (exts.has(ext)) yield join(startPath, entry.name);
    }
  }
}

export function relPath(abs) {
  return abs.slice(REPO_ROOT.length + 1).replace(/\\/g, "/");
}
