// Discovers WHICH of a package's APIs our code actually imports, so the
// analyzer can reason about intersection with the version's changes instead of
// guessing. Heuristic (regex over source, not a full parser) — its output feeds
// an LLM that tolerates approximation, so we favour breadth over precision.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { REPO_ROOT, walkFiles, importRegex, relPath } from "./util.mjs";

const USAGE_ROOTS = ["src", "vite.config.js", "index.html", "scripts"];

// Walk backward from the matched `from "pkg"` line to the statement's `import`
// keyword so multi-line named-import blocks are captured whole.
function collectImportStatement(lines, fromIdx) {
  let start = fromIdx;
  for (let j = fromIdx; j >= 0 && j > fromIdx - 12; j--) {
    if (/(^|[^.\w])import\b/.test(lines[j]) || /\brequire\s*\(/.test(lines[j])) {
      start = j;
      break;
    }
  }
  return lines.slice(start, fromIdx + 1).join("\n");
}

function parseImportedSymbols(statement) {
  const symbols = new Set();
  const flat = statement.replace(/\s+/g, " ");

  const ns = flat.match(/import\s+\*\s+as\s+(\w+)/);
  if (ns) symbols.add(`* as ${ns[1]}`);

  const def = flat.match(/import\s+(\w+)\s*(?:,|from)/);
  if (def && def[1] !== "type") symbols.add(`default (${def[1]})`);

  const named = flat.match(/\{([^}]*)\}/);
  if (named) {
    for (const part of named[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && name !== "type") symbols.add(name);
    }
  }
  return symbols;
}

export async function discoverUsage(packageName) {
  const re = importRegex(packageName);
  const symbols = new Set();
  const sites = [];

  for (const root of USAGE_ROOTS) {
    for await (const file of walkFiles(resolve(REPO_ROOT, root))) {
      const text = await readFile(file, "utf8");
      if (!re.test(text)) continue;
      const lines = text.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!re.test(line)) return;
        const statement = collectImportStatement(lines, i);
        for (const sym of parseImportedSymbols(statement)) symbols.add(sym);
        sites.push({
          file: relPath(file),
          line: i + 1,
          snippet: statement.trim().slice(0, 300),
        });
      });
    }
  }

  return { symbols: [...symbols].sort(), sites };
}
