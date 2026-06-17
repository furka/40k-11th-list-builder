import { isBattleLine } from "./is-battleline";
import { isDedicatedTransport } from "./is-dedicated-transport";
import { battleSizeRules } from "./battle-size";

/**
 * Returns the maximum number of copies of `option` (a datasheet) the list
 * may include. Battle Line / Dedicated Transport use the doubled cap; Epic
 * Hero is always 1. The base caps come from the battle-size table (Incursion
 * 2 / Battleline 4, Strike Force 3 / Battleline 6).
 */
export function unitMax(option, list) {
  if (option.epicHero) return 1;

  const rules = battleSizeRules(list);
  if (isBattleLine(option) || isDedicatedTransport(option)) {
    return rules.battlelineCap;
  }
  return rules.unitCap;
}
