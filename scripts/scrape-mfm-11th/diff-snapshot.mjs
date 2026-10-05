// Produce a human-readable markdown diff between two resolved MFM snapshot
// states. Per faction it reports datasheet points/size changes, leader/support
// attach-target changes, and detachment changes (DP, role, tags, leader grants,
// enhancements). All of these come from the MFM scrape and drive list
// validation, so a silent change to any of them is worth a PR reviewer's eye —
// GW has re-published the MFM under an unchanged version label before.
//
// Known limitations (intentional, not worth fuzzy-matching today):
//   - A renamed datasheet/detachment/enhancement appears as removal + addition.
//   - A renamed size option appears the same way.
//   - Tier structure changes are flagged but not enumerated.
//   - wargearOptions and role colors are not diffed.
//
// List-valued fields (tags, attachesTo) are compared as sets: the site
// sometimes reorders them, which carries no rules meaning.

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
    return `${header}\n\nNo datasheet, points, or detachment changes.`;
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
    const sheetLines = [
      ...diffSizes(p.sizes ?? [], n.sizes ?? []),
      ...diffAttachesTo("leader", p.leader, n.leader),
      ...diffAttachesTo("support", p.support, n.support),
    ];
    if (Boolean(p.legends) !== Boolean(n.legends)) {
      sheetLines.push(`- ${n.legends ? "now Legends" : "no longer Legends"}`);
    }
    if (sheetLines.length) {
      lines.push(`- ${name}\n${indent(sheetLines)}`);
    }
  }

  const detachmentLines = diffDetachments(prior.detachments ?? [], next.detachments ?? []);
  if (detachmentLines.length) {
    lines.push(`- Detachments\n${indent(detachmentLines)}`);
  }

  if (lines.length === 0) return null;
  return `### ${prior.faction}\n\n${lines.join("\n")}`;
}

function diffDetachments(priorDets, nextDets) {
  const priorBy = new Map(priorDets.map((d) => [d.name, d]));
  const nextBy = new Map(nextDets.map((d) => [d.name, d]));
  const allNames = [...new Set([...priorBy.keys(), ...nextBy.keys()])].sort();
  const out = [];
  for (const name of allNames) {
    const p = priorBy.get(name);
    const n = nextBy.get(name);
    if (!p) { out.push(`- **+ NEW detachment** ${name}`); continue; }
    if (!n) { out.push(`- **- REMOVED detachment** ${name}`); continue; }
    const changes = [];
    if (p.dp !== n.dp) changes.push(`- DP: **${p.dp} → ${n.dp}**`);
    if (p.role?.name !== n.role?.name) {
      changes.push(`- role: ${p.role?.name ?? "(none)"} → ${n.role?.name ?? "(none)"}`);
    }
    const tags = setDelta(p.tags, n.tags);
    if (tags) changes.push(`- tags: ${tags}`);
    changes.push(...diffAttachesTo("leader", p.leader, n.leader));
    changes.push(...diffEnhancements(p.enhancements ?? [], n.enhancements ?? []));
    if (changes.length) out.push(`- **${name}**\n${indent(changes)}`);
  }
  return out;
}

function diffEnhancements(priorEnh, nextEnh) {
  const priorBy = new Map(priorEnh.map((e) => [e.name, e]));
  const nextBy = new Map(nextEnh.map((e) => [e.name, e]));
  const allNames = [...new Set([...priorBy.keys(), ...nextBy.keys()])].sort();
  const out = [];
  for (const name of allNames) {
    const p = priorBy.get(name);
    const n = nextBy.get(name);
    if (!p) { out.push(`- **+ enhancement added:** ${name} @ ${n.points}pts`); continue; }
    if (!n) { out.push(`- **- enhancement removed:** ${name} (was ${p.points}pts)`); continue; }
    if (p.points !== n.points) out.push(`- enhancement ${name}: ${pointsChange(p.points, n.points)}`);
    if (Boolean(p.nonCharacterOnly) !== Boolean(n.nonCharacterOnly)) {
      out.push(`- enhancement ${name}: ${n.nonCharacterOnly ? "now" : "no longer"} non-CHARACTER only`);
    }
  }
  return out;
}

function diffAttachesTo(label, prior, next) {
  const delta = setDelta(prior?.attachesTo, next?.attachesTo);
  return delta ? [`- ${label}: ${delta}`] : [];
}

function setDelta(prior = [], next = []) {
  const p = new Set(prior);
  const n = new Set(next);
  const added = [...n].filter((x) => !p.has(x)).sort();
  const removed = [...p].filter((x) => !n.has(x)).sort();
  const parts = [...added.map((x) => `+ ${x}`), ...removed.map((x) => `- ${x}`)];
  return parts.length ? parts.join(", ") : null;
}

function pointsChange(oldP, newP) {
  const delta = newP - oldP;
  const arrow = delta > 0 ? "↑" : "↓";
  const sign = delta > 0 ? "+" : "";
  return `**${oldP} → ${newP}** ${arrow} (${sign}${delta})`;
}

function indent(lines) {
  return lines.map((l) => l.replace(/^/gm, "  ")).join("\n");
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
      out.push(`- ${describe(p)}: ${pointsChange(oldP, newP)}`);
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
