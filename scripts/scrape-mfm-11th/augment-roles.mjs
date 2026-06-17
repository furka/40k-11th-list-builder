// One-off: read each faction JSON in the current MFM version dir, fetch the
// corresponding live HTML, extract the battlefield-role tag (PURGE THE FOE /
// TAKE AND HOLD / RECONNAISSANCE / PRIORITY ASSETS / DISRUPTION) for each
// detachment, and patch each JSON in place with a `role: { name, color }` field.
//
// Only touches the detachment.role field — leaves enhancements, datasheets,
// dp, tags untouched. Safe to re-run.

import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { fetchFactionHtml } from "./fetch.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = resolve(__dirname, "../../src/data/munitorum-field-manual-11th");

function extractDetachmentExtras(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const out = {};
  // Each detachment card sits inside `div.flex.flex-col.space-y-1.m-1...`.
  // Title bar holds the detachment name; the role bar (colored), UNIQUE tag
  // bar, and ENHANCEMENTS list follow. CURSED-LEGION-style detachments also
  // append a `<div class="mx-3 font-bold">LEADER: …</div>` after the last
  // enhancement <li>.
  const cards = doc.querySelectorAll(
    "div.flex.flex-col.space-y-1.m-1.print\\:break-inside-avoid-page"
  );
  for (const card of cards) {
    const nameSpan = card.querySelector(
      ":scope > div:first-child span.text-xl, :scope > div:first-child span.break-all"
    );
    if (!nameSpan) continue;
    const name = nameSpan.textContent.trim();
    const record = { role: null, leader: null };

    for (const div of card.querySelectorAll(":scope > div[style*='background-color']")) {
      const text = div.textContent.trim();
      const style = div.getAttribute("style") || "";
      const m = style.match(/background-color:\s*(#[0-9A-Fa-f]+)/);
      if (!text || !m) continue;
      record.role = { name: text, color: m[1] };
      break;
    }

    const leaderDiv = card.querySelector("ul.leaders div.mx-3.font-bold");
    if (leaderDiv) {
      const spans = leaderDiv.querySelectorAll("span");
      const labelText = spans[0]?.textContent.trim() ?? "";
      if (labelText.startsWith("LEADER:") && spans[1]) {
        const attachesTo = spans[1].textContent
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (attachesTo.length) record.leader = { attachesTo };
      }
    }

    out[name] = record;
  }
  return out;
}

async function main() {
  // Find latest version dir.
  const dirs = (await readdir(OUT_ROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const versionDir = dirs[dirs.length - 1];
  if (!versionDir) {
    console.error("No version dir found under", OUT_ROOT);
    process.exit(1);
  }
  const versionPath = join(OUT_ROOT, versionDir);
  console.log("Augmenting", versionPath);

  const files = (await readdir(versionPath)).filter(
    (f) => f.endsWith(".json") && f !== "_manifest.json"
  );

  let okCount = 0;
  let failCount = 0;
  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    const jsonPath = join(versionPath, file);
    try {
      process.stdout.write(`  ${slug} … `);
      const html = await fetchFactionHtml(slug, { refresh: false });
      const extras = extractDetachmentExtras(html);
      const json = JSON.parse(await readFile(jsonPath, "utf8"));
      let rolePatched = 0;
      let leaderPatched = 0;
      for (const det of json.detachments ?? []) {
        const rec = extras[det.name] ?? {};
        det.role = rec.role ?? null;
        det.leader = rec.leader ?? null;
        if (det.role) rolePatched++;
        if (det.leader) leaderPatched++;
      }
      await writeFile(jsonPath, JSON.stringify(json, null, 2), "utf8");
      console.log(
        `ok (${rolePatched}/${json.detachments?.length ?? 0} roles, ${leaderPatched} leaders)`
      );
      okCount++;
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
      failCount++;
    }
  }

  console.log(`Done. ${okCount} ok, ${failCount} failed.`);
  if (failCount > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
