// Orchestrates the AI dependency review for a Dependabot PR and renders a
// Markdown verdict comment. Blast radius gates the depth: tooling-only packages
// short-circuit (they can't ship a bug to users), deployed/unknown packages get
// the full usage + changelog + LLM analysis.
//
// Usage:
//   node scripts/dep-review/index.mjs --package vue --from 3.5.38 --to 3.6.0 \
//     --update-type version-update:semver-minor --out dep-review.md
//
// --package accepts a comma list (grouped updates). Per-package versions are
// only known for single-dependency Dependabot PRs (--from/--to), so grouped
// updates fall back to blast-radius-only notes.

import { appendFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";

import { classifyBlastRadius } from "./blast-radius.mjs";
import { discoverUsage } from "./discover-usage.mjs";
import { gatherChanges } from "./gather-changes.mjs";
import { analyzeUpdate, MODEL_ID } from "./analyze.mjs";

const COMMENT_MARKER = "<!-- dep-review -->";

const SEVERITY = { safe: 0, review: 1, risky: 2 };
const EMOJI = { safe: "✅", review: "⚠️", risky: "⛔" };
const LABEL = { safe: "SAFE", review: "REVIEW", risky: "RISKY" };

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

async function reviewPackage({ packageName, from, to, updateType }) {
  const blast = await classifyBlastRadius(packageName);

  if (blast.radius === "tooling-only") {
    return {
      packageName,
      from,
      to,
      blast,
      verdict: {
        verdict: "safe",
        summary:
          "Tooling-only dependency — imported only under `scripts/`, so it never ships in the deployed bundle. A regression could at most affect the data-scraping pipeline, which is validated when the scraper's auto-generated PR runs and a human reviews the diff.",
        affectedUsages: [],
        relevantBreakingChanges: [],
        recommendedManualChecks: [],
      },
      mode: "short-circuit",
    };
  }

  if (!from || !to) {
    return {
      packageName,
      from,
      to,
      blast,
      verdict: {
        verdict: blast.radius === "deployed" ? "review" : "safe",
        summary:
          "Part of a grouped update, so exact old→new versions aren't available for a deep analysis. Classified by blast radius only" +
          (blast.radius === "deployed"
            ? " — this one **ships to users**, so glance at the changelog before merging."
            : "."),
        affectedUsages: [],
        relevantBreakingChanges: [],
        recommendedManualChecks: [],
      },
      mode: "blast-radius-only",
    };
  }

  const usage = await discoverUsage(packageName);
  const changes = await gatherChanges(packageName, from, to);
  const { verdict } = await analyzeUpdate({
    packageName,
    from,
    to,
    updateType,
    blastRadius: blast.radius,
    usage,
    changes,
  });

  return { packageName, from, to, blast, verdict, mode: "full", usage, changes };
}

// The schema leaves confidence's scale to the model, which may answer 0-1 or
// 0-100; normalize both to a percentage.
function renderConfidence(confidence) {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return "";
  const pct = confidence <= 1 ? confidence * 100 : confidence;
  return ` · confidence ${Math.round(pct)}%`;
}

function renderPackage(result) {
  const { packageName, from, to, blast, verdict } = result;
  const v = verdict.verdict;
  const range = from && to ? `\`${from}\` → \`${to}\`` : "grouped update";
  const radiusLabel =
    blast.radius === "deployed"
      ? "**deployed** (ships to users)"
      : blast.radius === "tooling-only"
        ? "tooling-only (not deployed)"
        : "unknown";

  const parts = [];
  parts.push(`### ${EMOJI[v]} \`${packageName}\` — ${LABEL[v]}`);
  parts.push(
    `${range} · blast radius: ${radiusLabel}` + renderConfidence(verdict.confidence)
  );
  parts.push("");
  parts.push(verdict.summary || "");

  if (verdict.affectedUsages?.length) {
    parts.push("");
    parts.push("**Where our code is affected**");
    for (const u of verdict.affectedUsages) {
      parts.push(`- \`${u.file}\` — \`${u.symbol}\`: ${u.reason}`);
    }
  }
  if (verdict.relevantBreakingChanges?.length) {
    parts.push("");
    parts.push("**Relevant changes in this bump**");
    for (const c of verdict.relevantBreakingChanges) parts.push(`- ${c}`);
  }
  if (verdict.recommendedManualChecks?.length) {
    parts.push("");
    parts.push("**Recommended manual checks**");
    for (const c of verdict.recommendedManualChecks) parts.push(`- ${c}`);
  }
  return parts.join("\n");
}

function renderComment(results, overall) {
  const header = [
    COMMENT_MARKER,
    `## 🤖 Dependency review — ${EMOJI[overall]} ${LABEL[overall]}`,
    "",
    "Reasons about **our actual usage** of the package against **what changed** in this bump — not the crowd-sourced compatibility score. Advisory: this does not block merge.",
    "",
  ];
  const body = results.map(renderPackage).join("\n\n---\n\n");
  const footer = [
    "",
    "---",
    `<sub>Verdict by \`${MODEL_ID}\`. Runtime deps that reach \`src/\` get a full analysis; tooling-only deps are noted and skipped.</sub>`,
  ];
  return [...header, body, ...footer].join("\n");
}

function setGithubOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  appendFileSync(file, `${name}=${value}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packages = String(args.package || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (!packages.length) {
    console.error("dep-review: no --package provided");
    process.exit(2);
  }

  const single = packages.length === 1;
  const results = [];
  for (const packageName of packages) {
    results.push(
      await reviewPackage({
        packageName,
        from: single ? args.from : undefined,
        to: single ? args.to : undefined,
        updateType: args["update-type"],
      })
    );
  }

  const overall = results.reduce(
    (worst, r) =>
      SEVERITY[r.verdict.verdict] > SEVERITY[worst] ? r.verdict.verdict : worst,
    "safe"
  );

  const markdown = renderComment(results, overall);
  const outPath = typeof args.out === "string" ? args.out : null;
  if (outPath) await writeFile(outPath, markdown + "\n", "utf8");
  console.log(markdown);

  setGithubOutput("verdict", overall);
  setGithubOutput(
    "blast_radius",
    results.some((r) => r.blast.radius === "deployed") ? "deployed" : "tooling-only"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
