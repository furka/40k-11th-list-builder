export function formatEnhancementRestrictions(enh) {
  if (!enh) return "";
  const lines = [];

  if (enh.allowedHosts?.length) {
    lines.push(`Attaches to: ${enh.allowedHosts.join(", ")}`);
  }

  if (enh.requiredKeywords?.length) {
    lines.push(`Requires keywords: ${enh.requiredKeywords.join(", ")}`);
  }

  if (enh.nonCharacterOnly) {
    lines.push("Non-characters only");
  }

  if (typeof enh.limit === "number") {
    lines.push(`Max ${enh.limit} per army`);
  }

  return lines.join("\n");
}
