import configs from "./config.json";
import { normalizeString } from "../../utils/name-match";

// Faction-keyed role classifications, flattened into normalized name arrays
// the parser consults at load time. 11th edition treats every chapter (Blood
// Angels, Dark Angels, etc.) as its own top-level faction, so sub-faction
// mappings, conditional overrides, endless-enhancement lists, and boarding-
// actions configs from the 10th-edition codebase are no longer needed.
export const CONFIGS = {
  "battle-line": [],
  "dedicated-transport": [],
  "epic-hero": [],
  character: [],
  fortification: [],
};

for (const key in configs) {
  const config = configs[key];

  for (const role of [
    "battle-line",
    "character",
    "epic-hero",
    "dedicated-transport",
    "fortification",
  ]) {
    if (config[role]) {
      CONFIGS[role].push(...config[role].map((i) => normalizeString(i)));
    }
  }
}
