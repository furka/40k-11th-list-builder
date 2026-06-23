export function formatEnhancementRestrictions(enh) {
  if (!enh) return "";
  const lines = [];

  if (enh.allowedHosts?.length) {
    lines.push(`Attaches to: ${enh.allowedHosts.join(", ")}`);
  }

  if (enh.requiredKeywords?.length) {
    lines.push(`Requires keywords: ${enh.requiredKeywords.join(", ")}`);
  }

  // Suppress "Characters only" when requiredKeywords already includes CHARACTER —
  // every characterOnly entry in the data carries CHARACTER in its keyword list,
  // so the line would just repeat what's above it.
  const keywordsCoverCharacter =
    enh.requiredKeywords?.some((k) => k.toUpperCase() === "CHARACTER");
  if (enh.characterOnly && !keywordsCoverCharacter) {
    lines.push("Characters only");
  }

  if (enh.nonCharacterOnly) {
    lines.push("Non-characters only");
  }

  if (enh.notOnEpicHeroes) {
    lines.push("Not on Epic Heroes");
  }

  if (typeof enh.limit === "number") {
    lines.push(`Max ${enh.limit} per army`);
  }

  return lines.join("\n");
}
