// Shared BSData JSON catalogue parser. BSData/wh40k-11e ships the newer JSON
// catalogue format (`.json`) rather than the legacy `.cat` XML BSData/wh40k-10e
// used. The two formats serialize the same object model — the JSON version just
// stores every collection as a plural-keyed array (`selectionEntries: [...]`)
// and every attribute as a plain property (`id`, `name`, `type`, `value`),
// so there's no `@_`-prefix or single-child-collapse bookkeeping to undo.
//
// Both catalogue files and the game-system file keep the XML root wrapper:
//   { "catalogue": { ... } }  or  { "gameSystem": { ... } }

export function parseCatalogue(text) {
  const tree = JSON.parse(text);
  return tree.catalogue ?? tree.gameSystem ?? null;
}

export function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
