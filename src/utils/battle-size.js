/**
 * 11th-edition battle-size rules.
 *
 * Numbers are sourced from the publicly previewed 11th rules (wargamer,
 * Warhammer Community, Goonhammer recaps). They will be replaced by the
 * canonical mustering doc once GW publishes it:
 *
 *   Incursion (1,000 pts): 2 DP, 2 enhancements, 2-of-each unit
 *                          (4 for Battleline), no 3-DP detachments.
 *   Strike Force (2,000 pts): 3 DP, 4 enhancements, 3-of-each unit
 *                             (6 for Battleline), 3-DP detachments allowed.
 *   Onslaught (3,000 pts): not yet documented — treat as Strike Force
 *                          until GW confirms scale.
 */
export function battleSizeRules(list) {
  const points = list?.maxPoints ?? 2000;
  if (points < 2000) {
    return {
      label: "Incursion",
      maxDP: 2,
      maxEnhancements: 2,
      unitCap: 2,
      battlelineCap: 4,
      allow3DpDetachment: false,
    };
  }
  return {
    label: "Strike Force",
    maxDP: 3,
    maxEnhancements: 4,
    unitCap: 3,
    battlelineCap: 6,
    allow3DpDetachment: true,
  };
}
