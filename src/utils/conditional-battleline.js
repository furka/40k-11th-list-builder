import rulesByFaction from "../data/configs/conditional-battleline.auto.json";

const EMPTY = new Set();

function ruleFires(rule, detSet) {
  switch (rule.trigger?.type) {
    case "detachment":
      return detSet.has(rule.trigger.name);
    default:
      return false;
  }
}

export function conditionalBattlelineUnits(list, rules = rulesByFaction) {
  if (!list?.faction) return EMPTY;
  const factionRules = rules[list.faction] ?? [];
  const manual = list.bonusBattleline ?? [];

  if (factionRules.length === 0 && manual.length === 0) return EMPTY;

  const out = new Set(manual);
  const detSet = new Set(list.detachments ?? []);
  for (const rule of factionRules) {
    if (ruleFires(rule, detSet)) {
      for (const name of rule.battleLine ?? []) out.add(name);
    }
  }
  return out;
}

export function autoBattlelineSource(list, datasheetName, rules = rulesByFaction) {
  const factionRules = rules[list?.faction] ?? [];
  const detSet = new Set(list?.detachments ?? []);
  for (const rule of factionRules) {
    if (ruleFires(rule, detSet) && rule.battleLine?.includes(datasheetName)) {
      return rule.trigger;
    }
  }
  return null;
}
