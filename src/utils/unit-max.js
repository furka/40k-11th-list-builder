import { isBattleLine } from "./is-battleline";
import { isDedicatedTransport } from "./is-dedicated-transport";
import { battleSizeRules } from "./battle-size";
import { conditionalBattlelineUnits } from "./conditional-battleline";

/**
 * Returns the maximum number of copies of `option` (a datasheet) the list
 * may include. Battle Line / Dedicated Transport use the doubled cap; Epic
 * Hero is always 1. The base caps come from the battle-size table (Incursion
 * 2 / Battleline 4, Strike Force 3 / Battleline 6).
 *
 * Conditional Battleline (detachment-granted via `conditional-battleline.auto.json`
 * or user-marked via `list.bonusBattleline`) also gets the doubled cap.
 */
export function unitMax(option, list) {
  if (option.epicHero) return 1;

  const rules = battleSizeRules(list);
  const grantedBl = conditionalBattlelineUnits(list).has(option.name);
  if (isBattleLine(option) || isDedicatedTransport(option) || grantedBl) {
    return rules.battlelineCap;
  }
  return rules.unitCap;
}
