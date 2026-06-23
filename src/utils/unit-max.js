import { isBattleLine } from "./is-battleline";
import { hasKeyword } from "./keywords";
import { battleSizeRules } from "./battle-size";

/**
 * Returns the maximum number of copies of `option` (a datasheet) the list
 * may include. Battle Line / Dedicated Transport use the doubled cap; Epic
 * Hero is always 1. The base caps come from the battle-size table (Incursion
 * 2 / Battleline 4, Strike Force 3 / Battleline 6).
 *
 * Detachment-conditional Battleline and user-marked `list.bonusBattleline`
 * grants are absorbed by `isBattleLine(option, list)` via the dynamic
 * effective-keywords union.
 */
export function unitMax(option, list) {
  if (hasKeyword(option, "EPIC HERO")) return 1;

  const rules = battleSizeRules(list);
  if (isBattleLine(option, list) || hasKeyword(option, "DEDICATED TRANSPORT")) {
    return rules.battlelineCap;
  }
  return rules.unitCap;
}
