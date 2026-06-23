// Produce a human-readable markdown diff between two resolved MFM snapshot
// states. Walks each faction's datasheets and sizes; reports points changes,
// additions, and removals at datasheet+size granularity.
//
// Known limitations (intentional, not worth fuzzy-matching today):
//   - A renamed datasheet appears as one removal + one addition.
//   - A renamed size option appears the same way.
//   - Tier structure changes are flagged but not enumerated.
//
// Skips detachments, enhancements, wargearOptions, and the role/leader/support
// metadata — those changes are tracked separately (auto.json files) and would
// drown out the points signal that PR reviewers actually care about.

export function diffSnapshots(priorFactions, nextFactions, { siteVersion, scrapedAt, priorDirName } = {}) {
  const header = renderHeader({ siteVersion, scrapedAt, priorDirName, priorEmpty: priorFactions.size === 0 });
  if (priorFactions.size === 0) return header;

  const sections = [];
  const allSlugs = new Set([...priorFactions.keys(), ...nextFactions.keys()]);
  for (const slug of [...allSlugs].sort()) {
    const p = priorFactions.get(slug);
    const n = nextFactions.get(slug);
    if (!p) { sections.push(renderNewFaction(n)); continue; }
    if (!n) { sections.push(renderRemovedFaction(p)); continue; }
    const section = diffFaction(p, n);
    if (section) sections.push(section);
  }

  if (sections.length === 0) {
    return `${header}\n\nNo datasheet- or points-level changes.`;
  }

  return `${header}\n\n${sections.length} faction(s) changed.\n\n${sections.join("\n\n")}`;
}

function renderHeader({ siteVersion, scrapedAt, priorDirName, priorEmpty }) {
  const lines = [`## MFM changes — ${siteVersion ?? "(unknown version)"} (scraped ${scrapedAt ?? "(unknown date)"})`];
  if (priorEmpty) {
    lines.push("", "Initial snapshot — no prior to diff against.");
  } else if (priorDirName) {
    lines.push("", `Diff vs prior snapshot \`${priorDirName}\`.`);
  }
  return lines.join("\n");
}

function renderNewFaction(faction) {
  const names = (faction.datasheets ?? []).map((d) => d.name).sort();
  const list = names.map((n) => `  - ${n}`).join("\n");
  return `### ${faction.faction} (new faction)\n\n${list}`;
}

function renderRemovedFaction(faction) {
  return `### ${faction.faction} (removed)`;
}

function diffFaction(prior, next) {
  const priorBy = new Map((prior.datasheets ?? []).map((d) => [d.name, d]));
  const nextBy = new Map((next.datasheets ?? []).map((d) => [d.name, d]));
  const allNames = [...new Set([...priorBy.keys(), ...nextBy.keys()])].sort();
  const lines = [];
  for (const name of allNames) {
    const p = priorBy.get(name);
    const n = nextBy.get(name);
    if (!p) { lines.push(`- **+ NEW** ${name}: ${summarizeSizes(n.sizes)}`); continue; }
    if (!n) { lines.push(`- **- REMOVED** ${name}`); continue; }
    const sizeLines = diffSizes(p.sizes ?? [], n.sizes ?? []);
    if (sizeLines.length) {
      lines.push(`- ${name}\n${sizeLines.map((l) => `  ${l}`).join("\n")}`);
    }
  }
  if (lines.length === 0) return null;
  return `### ${prior.faction}\n\n${lines.join("\n")}`;
}

function diffSizes(priorSizes, nextSizes) {
  const key = (s) => s.name ?? `${s.models}-models`;
  const priorBy = new Map(priorSizes.map((s) => [key(s), s]));
  const nextBy = new Map(nextSizes.map((s) => [key(s), s]));
  const allKeys = new Set([...priorBy.keys(), ...nextBy.keys()]);
  const out = [];
  for (const k of allKeys) {
    const p = priorBy.get(k);
    const n = nextBy.get(k);
    if (!p) { out.push(`- **+ option added:** ${describe(n)} @ ${basePoints(n)}pts`); continue; }
    if (!n) { out.push(`- **- option removed:** ${describe(p)} (was ${basePoints(p)}pts)`); continue; }
    const oldP = basePoints(p);
    const newP = basePoints(n);
    if (oldP !== newP) {
      const delta = newP - oldP;
      const arrow = delta > 0 ? "↑" : "↓";
      const sign = delta > 0 ? "+" : "";
      out.push(`- ${describe(p)}: **${oldP} → ${newP}** ${arrow} (${sign}${delta})`);
    } else if (JSON.stringify(p.tiers ?? []) !== JSON.stringify(n.tiers ?? [])) {
      out.push(`- ${describe(p)}: tier structure changed`);
    }
  }
  return out;
}

function basePoints(size) {
  return size?.tiers?.[0]?.points ?? 0;
}

function describe(size) {
  if (size.name) return size.name;
  const m = size.models ?? 0;
  return `${m} model${m === 1 ? "" : "s"}`;
}

function summarizeSizes(sizes) {
  if (!sizes?.length) return "(no sizes)";
  return sizes.map((s) => `${describe(s)} @ ${basePoints(s)}pts`).join(", ");
}
