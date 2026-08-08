// Classifies whether a bumped package can reach the DEPLOYED app or is
// tooling-only. This is the first gate: a tooling-only dependency (imported
// solely under scripts/, e.g. pdfjs-dist) can't ship a bug to
// users, so the orchestrator short-circuits it without a full LLM analysis —
// exactly the case the user cares less about, since scraper regressions surface
// in the auto-generated data PRs a human already reviews.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { REPO_ROOT, walkFiles, importRegex, relPath } from "./util.mjs";

// Anything under these paths ends up in (or shapes) the production bundle.
// vite.config.js / index.html count because build-time plugins (vite-svg-loader,
// @vitejs/plugin-vue, sass) transform what actually ships.
const DEPLOYED_ROOTS = ["src", "vite.config.js", "index.html"];
const TOOLING_ROOTS = ["scripts"];

async function filesImporting(re, roots) {
  const hits = [];
  for (const root of roots) {
    const abs = resolve(REPO_ROOT, root);
    for await (const file of walkFiles(abs)) {
      const text = await readFile(file, "utf8");
      if (re.test(text)) hits.push(relPath(file));
    }
  }
  return hits;
}

export async function classifyBlastRadius(packageName) {
  const pkgJson = JSON.parse(
    await readFile(resolve(REPO_ROOT, "package.json"), "utf8")
  );

  let declaredIn = "transitive";
  if (pkgJson.dependencies?.[packageName]) declaredIn = "dependencies";
  else if (pkgJson.devDependencies?.[packageName]) declaredIn = "devDependencies";

  const re = importRegex(packageName);
  const deployedFiles = await filesImporting(re, DEPLOYED_ROOTS);
  const toolingFiles = await filesImporting(re, TOOLING_ROOTS);

  let radius;
  if (declaredIn === "dependencies") {
    // Runtime dependency: ships to users whether or not we spotted an import
    // (could be pulled in indirectly, e.g. by a plugin).
    radius = "deployed";
  } else if (deployedFiles.length > 0) {
    radius = "deployed";
  } else if (toolingFiles.length > 0) {
    radius = "tooling-only";
  } else {
    // Not a declared runtime dep and not directly imported anywhere we can see
    // (transitive, or a devDependency used only via config we didn't match).
    // Don't assume safe — let the full analysis judge.
    radius = "unknown";
  }

  return { packageName, declaredIn, radius, deployedFiles, toolingFiles };
}
