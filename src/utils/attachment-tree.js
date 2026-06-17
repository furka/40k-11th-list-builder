/**
 * Pure helpers for the army-list attachment model.
 *
 * The store keeps `units` as a flat array; each unit may carry an optional
 * `attachedTo: <host-unit.id>` field. The visual tree is derived on render.
 * Sibling order at each level comes from the flat array's order.
 */

export function buildTree(units) {
  const byParent = new Map();
  byParent.set(null, []);
  const validIds = new Set(units.map((u) => u.id));

  for (const u of units) {
    // Tolerate dangling parents: if attachedTo points at a missing unit, the
    // child orphans to root. (Happens with corrupt local state or partial
    // share-URL imports.)
    const parent = u.attachedTo && validIds.has(u.attachedTo) ? u.attachedTo : null;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(u);
  }

  function nodeFor(unit) {
    return {
      unit,
      children: (byParent.get(unit.id) ?? []).map(nodeFor),
    };
  }

  return (byParent.get(null) ?? []).map(nodeFor);
}

export function depthOf(unit, units) {
  const byId = new Map(units.map((u) => [u.id, u]));
  let depth = 0;
  let cursor = byId.get(unit.id);
  const seen = new Set(); // cycle guard (shouldn't happen, but cheap insurance)
  while (cursor?.attachedTo && byId.has(cursor.attachedTo)) {
    if (seen.has(cursor.id)) return depth;
    seen.add(cursor.id);
    depth++;
    cursor = byId.get(cursor.attachedTo);
  }
  return depth;
}

export function descendantIds(unit, units) {
  const byParent = new Map();
  for (const u of units) {
    if (!u.attachedTo) continue;
    if (!byParent.has(u.attachedTo)) byParent.set(u.attachedTo, []);
    byParent.get(u.attachedTo).push(u.id);
  }
  const out = new Set();
  const stack = [unit.id];
  while (stack.length) {
    const id = stack.pop();
    for (const childId of byParent.get(id) ?? []) {
      if (out.has(childId)) continue;
      out.add(childId);
      stack.push(childId);
    }
  }
  return out;
}

export function canAttach(child, host, units, { maxDepth = 3 } = {}) {
  if (!child || !host) return false;
  if (child.id === host.id) return false;
  if (descendantIds(child, units).has(host.id)) return false;
  // The deepest descendant of `child` would land at this absolute depth once
  // re-parented under `host`. Reject if any of them would exceed maxDepth-1
  // (0-indexed: depth 0 = root, depth 1 / 2 / 3 nested).
  const hostDepth = depthOf(host, units);
  const subtreeDepth = subtreeMaxDepth(child, units);
  return hostDepth + 1 + subtreeDepth <= maxDepth - 1;
}

function subtreeMaxDepth(unit, units) {
  // Depth of the deepest descendant relative to `unit` (0 if no children).
  const byParent = new Map();
  for (const u of units) {
    if (!u.attachedTo) continue;
    if (!byParent.has(u.attachedTo)) byParent.set(u.attachedTo, []);
    byParent.get(u.attachedTo).push(u);
  }
  let max = 0;
  function walk(id, d) {
    if (d > max) max = d;
    for (const child of byParent.get(id) ?? []) walk(child.id, d + 1);
  }
  walk(unit.id, 0);
  return max;
}
