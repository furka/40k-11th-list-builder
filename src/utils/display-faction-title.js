export function displayFactionTitle(faction, allies) {
  const primary = (faction || "").trim();
  const list = Array.isArray(allies) ? allies.filter(Boolean) : [];
  if (!primary) return list.join(" + ");
  if (list.length === 0) return primary;
  return [primary, ...list].join(" + ");
}
