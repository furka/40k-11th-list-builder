/**
 * Single source of truth for "where can the dragged unit be dropped?"
 *
 * Called once at drag start with a snapshot of the army list. Returns every
 * legal Slot the drag could resolve to. The drag controller then hit-tests
 * the pointer against those slots; no other module evaluates legality.
 *
 * A Slot is one of:
 *   { type: 'reorder', parentId: string|null, index: number, key: string }
 *   { type: 'attach',  hostId:   string,                     key: string,
 *                      parentKey: string, indexInParent: number }
 *   { type: 'bin',                                           key: 'bin'  }
 *
 * `index` follows `armyListStore.moveUnit`'s `sibIdx` semantics: 0 = first
 * sibling slot, N = past the last sibling, with the dragged unit excluded
 * from the sibling count (it gets removed before re-insertion).
 *
 * Attach slots carry `parentKey` (`"root"` or a host id) and `indexInParent`
 * (the host's position among its DRAGGED-EXCLUDED siblings). The drag
 * controller uses these to route a hit in the host row's top-25%/bottom-25%
 * edges to the adjacent reorder slot (`reorder:<parentKey>:<index>` /
 * `reorder:<parentKey>:<index+1>`) — see `pickActiveSlot`.
 *
 * Rules enforced:
 *   - depth ≤ 3 levels (root=0, attached=1, enh-on-attached=2)
 *   - no self / no cycle
 *   - leader: host must be in dragged.datasheet.leader.attachesTo
 *   - support: host must be in dragged.datasheet.support.attachesTo
 *   - enhancement: any host (still subject to depth + per-host cap)
 *   - regular bodyguards/vehicles/monsters: never attach to anything
 *   - max 1 leader per host
 *   - max 1 support per host
 *   - max 1 enhancement per host
 *   - cardinality counts self-exempt the dragged unit (so re-dropping a
 *     unit on its current host is always legal)
 *
 * Not enforced here (handled elsewhere):
 *   - enhancement uniqueness per army (`armyList.getUnitValidationError`)
 *   - support-must-be-attached (same — surfaces as a red error if the user
 *     reorders a support to root, but the drop itself is allowed)
 *   - battle-size enhancement cap (`armyList.getUnitValidationError`)
 */

import { isEnhancementUnit, isWargearUnit } from "./attachment-rules";
import { wargearMaxPerUnit, wargearCountOn } from "./wargear-limits";

const MAX_DEPTH = 3;

function depthOf(unit, byId) {
  let depth = 0;
  let cursor = unit;
  const seen = new Set();
  while (cursor?.attachedTo && byId.has(cursor.attachedTo)) {
    if (seen.has(cursor.id)) return depth;
    seen.add(cursor.id);
    depth++;
    cursor = byId.get(cursor.attachedTo);
  }
  return depth;
}

function subtreeMaxDepth(unit, byParent) {
  let max = 0;
  function walk(id, d) {
    if (d > max) max = d;
    for (const child of byParent.get(id) ?? []) walk(child.id, d + 1);
  }
  walk(unit.id, 0);
  return max;
}

function descendantIds(rootId, byParent) {
  const out = new Set();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    for (const child of byParent.get(id) ?? []) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      stack.push(child.id);
    }
  }
  return out;
}

function isLeader(unit, getDataSheet) {
  const ds = getDataSheet(unit.name);
  return Boolean(ds?.leader?.attachesTo?.length);
}

function isSupport(unit, getDataSheet) {
  const ds = getDataSheet(unit.name);
  return Boolean(ds?.support?.attachesTo?.length);
}

export function legalDropSlots(
  units,
  draggedId,
  getDataSheet,
  enhancementMeta = null
) {
  const dragged = units.find((u) => u.id === draggedId);
  if (!dragged) return [];

  const byId = new Map(units.map((u) => [u.id, u]));
  const byParent = new Map();
  byParent.set(null, []);
  for (const u of units) {
    const p = u.attachedTo && byId.has(u.attachedTo) ? u.attachedTo : null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(u);
  }

  const draggedDescendants = descendantIds(dragged.id, byParent);
  const draggedSubtreeDepth = subtreeMaxDepth(dragged, byParent);
  const draggedDs = getDataSheet(dragged.name);
  const draggedIsEnhancement = isEnhancementUnit(dragged);
  const draggedIsWargear = isWargearUnit(dragged);
  const draggedIsLeader =
    !draggedIsEnhancement &&
    !draggedIsWargear &&
    Boolean(draggedDs?.leader?.attachesTo?.length);
  const draggedIsSupport =
    !draggedIsEnhancement &&
    !draggedIsWargear &&
    Boolean(draggedDs?.support?.attachesTo?.length);

  function canAttachTo(host) {
    if (host.id === dragged.id) return false;
    if (draggedDescendants.has(host.id)) return false;

    const hostDepth = depthOf(host, byId);
    if (hostDepth + 1 + draggedSubtreeDepth > MAX_DEPTH - 1) return false;

    if (draggedIsWargear) {
      // Wargear is scoped to its declared parent datasheet.
      if (host.name !== dragged.parentDataSheet) return false;
      // Per-host cap for this specific option. The dragged unit's own row
      // is excluded so re-dropping a wargear on its current host is always
      // legal (it doesn't double-count itself).
      const option = getDataSheet(host.name)?.wargearOptions?.find(
        (w) => w.name === dragged.optionName
      );
      const max = wargearMaxPerUnit(option);
      const count = wargearCountOn(
        units,
        host.id,
        dragged.optionName,
        dragged.id
      );
      if (count >= max) return false;
      return true;
    }

    if (draggedIsLeader) {
      if (!draggedDs.leader.attachesTo.includes(host.name)) return false;
    } else if (draggedIsSupport) {
      if (!draggedDs.support.attachesTo.includes(host.name)) return false;
    } else if (draggedIsEnhancement) {
      // (Upgrade) enhancements attach to non-character units only; plain
      // enhancements attach to characters only. Optional per-enhancement
      // `allowedHosts` whitelist (from configs/enhancement-restrictions.json)
      // narrows it further. When no metadata is supplied (tests, legacy
      // call sites), fall back to the old free-form-host behavior.
      if (enhancementMeta) {
        if (
          enhancementMeta.allowedHosts?.length &&
          !enhancementMeta.allowedHosts.includes(host.name)
        ) {
          return false;
        }
        const hostDs = getDataSheet(host.name);
        if (enhancementMeta.isUnitUpgrade) {
          if (hostDs?.character) return false;
        } else {
          if (!hostDs?.character) return false;
        }
      }
    } else {
      // Regular bodyguard / vehicle / monster.
      return false;
    }

    const siblings = byParent.get(host.id) ?? [];
    let leaderCount = 0;
    let supportCount = 0;
    let enhancementCount = 0;
    for (const s of siblings) {
      if (s.id === dragged.id) continue;
      if (isEnhancementUnit(s)) enhancementCount++;
      else if (isWargearUnit(s)) continue; // not subject to the leader/support/enh caps
      else if (isLeader(s, getDataSheet)) leaderCount++;
      else if (isSupport(s, getDataSheet)) supportCount++;
    }
    if (draggedIsLeader && leaderCount >= 1) return false;
    if (draggedIsSupport && supportCount >= 1) return false;
    if (draggedIsEnhancement && enhancementCount >= 1) return false;

    return true;
  }

  const slots = [];

  // Attach slots — one per host that passes the rules above. Each carries
  // parentKey + indexInParent so the drag controller's edge-tie-break can
  // route an edge hit to the adjacent reorder slot by key lookup.
  for (const host of units) {
    if (!canAttachTo(host)) continue;
    const parent = host.attachedTo && byId.has(host.attachedTo) ? host.attachedTo : null;
    const parentKey = parent ?? "root";
    const siblings = (byParent.get(parent) ?? []).filter(
      (u) => u.id !== dragged.id
    );
    const indexInParent = siblings.findIndex((u) => u.id === host.id);
    slots.push({
      type: "attach",
      hostId: host.id,
      parentKey,
      indexInParent,
      key: `attach:${host.id}`,
    });
  }

  // Root reorder slots — emitted for everything EXCEPT wargear. A support
  // character can land at root (and gets a red error telling the user to
  // re-attach), but wargear is intrinsically a sub-option of a specific
  // datasheet — orphaning it makes no sense. The bin slot below still
  // gives the user a way to discard a wargear via drag.
  if (!draggedIsWargear) {
    const rootSiblings = (byParent.get(null) ?? []).filter(
      (u) => u.id !== dragged.id
    );
    for (let i = 0; i <= rootSiblings.length; i++) {
      slots.push({
        type: "reorder",
        parentId: null,
        index: i,
        key: `reorder:root:${i}`,
      });
    }
  }

  // Reorder slots under each host where attach is legal. Self-exemption in
  // canAttachTo means a unit dragged within its current parent's child list
  // always sees those reorder slots.
  for (const host of units) {
    if (host.id === dragged.id) continue;
    if (!canAttachTo(host)) continue;
    const siblings = (byParent.get(host.id) ?? []).filter(
      (u) => u.id !== dragged.id
    );
    for (let i = 0; i <= siblings.length; i++) {
      slots.push({
        type: "reorder",
        parentId: host.id,
        index: i,
        key: `reorder:${host.id}:${i}`,
      });
    }
  }

  slots.push({ type: "bin", key: "bin" });

  return slots;
}

/**
 * Hit-test a pointer against the enumerated legal slots using ROW geometry —
 * no inline gap elements, no layout shift on drag start.
 *
 * Each rendered row in the army list is registered with the drag store
 * (via `useRowEl`) under the row's unit id, carrying its `parentKey` and
 * `indexInParent` (in dragged-excluded space). Hit-test logic:
 *
 *   1. Bin wins if its rect contains the pointer (safest "I'm done").
 *   2. For each registered row whose rect contains the pointer:
 *      - middle 50% → attach to this row (if legal)
 *      - top    25% → the "above" reorder slot for this row (if legal)
 *      - bottom 25% → the "below" reorder slot for this row (if legal)
 *      Reorder slots are returned with `anchorRect` + `anchorEdge` so the
 *      drop overlay can position the insertion line on the right edge.
 *   3. null if nothing matches.
 *
 * `rows` is an iterable of `{ unitId, el, parentKey, indexInParent }`. The
 * dragged unit's own row is intentionally NOT registered — there's no
 * sensible drop "on yourself".
 *
 * Pure function; `getRect` and `rows` are passed in so the test suite can
 * use synthetic rects without a real DOM.
 */
export function pickActiveSlot({ legalSlots, getRect, rows, pointer }) {
  if (!legalSlots?.length || !pointer) return null;
  const { x, y } = pointer;
  const legalByKey = new Map(legalSlots.map((s) => [s.key, s]));

  const binSlot = legalByKey.get("bin");
  if (binSlot) {
    const r = getRect ? getRect("bin") : null;
    if (r && pointInRect(x, y, r)) return binSlot;
  }

  for (const row of rows ?? []) {
    if (!row?.el) continue;
    const r = row.el.getBoundingClientRect();
    if (!pointInRect(x, y, r)) continue;

    const range = r.bottom - r.top;
    const attach = legalByKey.get(`attach:${row.unitId}`);
    if (range <= 0) return attach ?? null;

    const upper = r.top + range * 0.25;
    const lower = r.bottom - range * 0.25;

    if (y < upper) {
      const above = legalByKey.get(
        `reorder:${row.parentKey}:${row.indexInParent}`
      );
      if (above) return { ...above, anchorRect: r, anchorEdge: "top" };
      return attach ?? null;
    }
    if (y > lower) {
      const below = legalByKey.get(
        `reorder:${row.parentKey}:${row.indexInParent + 1}`
      );
      if (below) {
        // "After this row in its parent" sits visually BELOW the row's whole
        // attached subtree, not just below the row itself. Walking the
        // registered rows for descendants and using the deepest one's bottom
        // edge keeps the insertion line from appearing in the middle of a
        // group (e.g., between a leader and its enhancement).
        const subtreeRect = subtreeBottomRect(rows, row.unitId, r);
        return { ...below, anchorRect: subtreeRect, anchorEdge: "bottom" };
      }
      return attach ?? null;
    }
    return attach ?? null;
  }

  return null;
}

function subtreeBottomRect(rows, rootUnitId, fallbackRect) {
  const childRowsByParent = new Map();
  for (const r of rows) {
    if (!r?.parentKey || !r?.el) continue;
    if (!childRowsByParent.has(r.parentKey)) {
      childRowsByParent.set(r.parentKey, []);
    }
    childRowsByParent.get(r.parentKey).push(r);
  }

  let bestRect = fallbackRect;
  const stack = [rootUnitId];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of childRowsByParent.get(id) ?? []) {
      const cr = child.el.getBoundingClientRect();
      if (cr.bottom > bestRect.bottom) bestRect = cr;
      stack.push(child.unitId);
    }
  }
  return bestRect;
}

function pointInRect(x, y, r) {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
