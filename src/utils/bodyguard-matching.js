/**
 * Maximum bipartite matching between Leader/Support units and their
 * available bodyguard units, using Kuhn's algorithm (augmenting paths).
 *
 * Each Leader (or Support) unit instance is the "left" side. Each bodyguard
 * unit instance is the "right" side, modeled as `${datasheetName}#${idx}`
 * slot ids. A Leader/Support can match any bodyguard slot whose datasheet
 * name is in its `attachesTo` list.
 *
 * Per Core Rules 19.04, each bodyguard unit has at most one Leader and one
 * Support attached to it, so the Leader matching and Support matching are
 * solved independently — both can land on the same bodyguard.
 *
 *   items: [{ id, attachesTo: string[] }]
 *   bodyguardCounts: { [datasheetName]: count }
 *
 * Returns a Set of item ids that DID get a bodyguard. Items not in the set
 * are the ones the UI should mark invalid.
 *
 * Complexity: O(V × E) where V = items.length and E = total bodyguard slots
 * across all attaches-to candidates. For an army-sized input (~dozens) this
 * is negligible.
 */
export function maxBipartiteMatching(items, bodyguardCounts) {
  const slotToItem = {};
  const itemsById = new Map(items.map((i) => [i.id, i]));

  function tryAssign(item, visited) {
    for (const name of item.attachesTo) {
      const slotCount = bodyguardCounts[name] || 0;
      for (let i = 0; i < slotCount; i++) {
        const slot = `${name}#${i}`;
        if (visited.has(slot)) continue;
        visited.add(slot);
        const occupantId = slotToItem[slot];
        if (
          occupantId === undefined ||
          tryAssign(itemsById.get(occupantId), visited)
        ) {
          slotToItem[slot] = item.id;
          return true;
        }
      }
    }
    return false;
  }

  const matched = new Set();
  for (const item of items) {
    if (tryAssign(item, new Set())) {
      matched.add(item.id);
    }
  }
  return matched;
}
