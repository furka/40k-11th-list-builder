import { hasKeyword } from "./keywords";
import { isBattleLine } from "./is-battleline";
import { isDedicatedTransport } from "./is-dedicated-transport";

// Maps the role-label tokens a user might type ("leader", "battle line",
// "epic hero" …) to a predicate over a datasheet. A token matches when the
// query is a substring of any of these labels AND the predicate is true,
// so "le" surfaces leaders & legends, "battle" surfaces battle line, etc.
//
// Battleline here is the static check (no list available in this code path)
// — detachment-granted battleline doesn't change keyword-search results,
// only Codex grouping/sorting.
const ROLE_LABELS = [
  { labels: ["leader"], match: (s) => !!s.leader },
  { labels: ["support"], match: (s) => !!s.support },
  { labels: ["battle line", "battleline"], match: (s) => isBattleLine(s) },
  { labels: ["character"], match: (s) => hasKeyword(s, "CHARACTER") },
  { labels: ["epic hero", "epichero"], match: (s) => hasKeyword(s, "EPIC HERO") },
  {
    labels: ["dedicated transport", "transport"],
    match: isDedicatedTransport,
  },
  { labels: ["fortification"], match: (s) => hasKeyword(s, "FORTIFICATION") },
  { labels: ["legends"], match: (s) => !!s.legends },
];

export function matchesRoleLabel(sheet, q) {
  for (const { labels, match } of ROLE_LABELS) {
    if (labels.some((l) => l.includes(q)) && match(sheet)) return true;
  }
  return false;
}

export function matchesDatasheet(sheet, query) {
  const q = query?.trim().toLowerCase();
  if (!q) return true;
  if (sheet.name.toLowerCase().includes(q)) return true;
  return matchesRoleLabel(sheet, q);
}

export function matchesDetachment(detachment, query) {
  const q = query?.trim().toLowerCase();
  if (!q) return true;
  const d = detachment;
  if (d.name.toLowerCase().includes(q)) return true;
  if (d.role?.name?.toLowerCase().includes(q)) return true;
  if (d.tags?.some((t) => t.toLowerCase().includes(q))) return true;
  if (d.enhancements?.some((e) => e.name.toLowerCase().includes(q))) return true;
  // "leader" surfaces detachments with a detachment-level LEADER block
  // (e.g. CURSED LEGION).
  if ("leader".includes(q) && d.leader) return true;
  return false;
}
