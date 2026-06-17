import { nameEquals } from "./name-match";
import { buildTree, descendantIds } from "./attachment-tree";

export const sortDataSheetAlphabetical = function (a, b) {
  a = a.name.toLowerCase();
  b = b.name.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
};

export const sortDataSheetPtsDescending = function (a, b) {
  a = getMostExpensiveOption(a.sizes);
  b = getMostExpensiveOption(b.sizes);
  return a < b ? 1 : a > b ? -1 : 0;
};

export const sortDataSheetPtsAscending = function (a, b) {
  a = getCheapestOption(a.sizes);
  b = getCheapestOption(b.sizes);
  return a < b ? -1 : a > b ? 1 : 0;
};

function getMostExpensiveOption(sizes) {
  return Math.max(...sizes.map((s) => s.basePoints ?? s.points));
}

function getCheapestOption(sizes) {
  return Math.min(...sizes.map((s) => s.basePoints ?? s.points));
}

export const sortOptionsPtsDescending = function (a, b) {
  a = a.basePoints ?? a.points;
  b = b.basePoints ?? b.points;
  return a < b ? 1 : a > b ? -1 : 0;
};

export const sortListPoints = function (mfmStore, currentMFM, allUnits, ascending = false) {
  const unitsById = new Map(allUnits.map((u) => [u.id, u]));
  const groupPoints = (unit) => {
    let total = mfmStore.getPoints(unit, currentMFM) ?? 0;
    for (const id of descendantIds(unit, allUnits)) {
      const u = unitsById.get(id);
      if (u) total += mfmStore.getPoints(u, currentMFM) ?? 0;
    }
    return total;
  };
  return function (a, b) {
    const aPoints = groupPoints(a);
    const bPoints = groupPoints(b);

    if (aPoints === bPoints) {
      return sortDataSheetAlphabetical(a, b);
    }

    return ascending
      ? aPoints < bPoints ? -1 : 1
      : aPoints < bPoints ? 1 : -1;
  };
};

// Sorts the army-list tree in place: roots are ordered by the comparator,
// each parent's children are ordered by the comparator among themselves, then
// the tree is flattened back in pre-order. Sibling order at each level in the
// flat array is what the render filters in ArmyList + ArmyListUnitNode pick
// up, so flat-order pre-order = visible order.
export function sortTree(units, comparator) {
  const tree = buildTree(units);
  const sortNode = (node) => {
    node.children.sort((a, b) => comparator(a.unit, b.unit));
    node.children.forEach(sortNode);
  };
  tree.sort((a, b) => comparator(a.unit, b.unit));
  tree.forEach(sortNode);

  const out = [];
  const walk = (node) => {
    out.push(node.unit);
    node.children.forEach(walk);
  };
  tree.forEach(walk);
  return out;
}

export const sortListByRole = function (getDataSheet) {
  return function (a, b) {
    const getRolePriority = (unit) => {
      const dataSheet = getDataSheet(unit.name);
      const isEnhancement =
        dataSheet?.enhancements || unit.name === "Enhancements";
      const isWargear = unit.name === "Wargear";

      // Wargear is always a child of its host — when this comparator runs at
      // root level it never sees one. Within a host's children it should
      // appear after the leader/support/enhancement attachments.
      if (isWargear) return 7;

      if (!dataSheet && !isEnhancement) return 5;

      if (dataSheet?.character || dataSheet?.epicHero) return 1;
      if (dataSheet?.leader) return 1;
      if (isEnhancement) return 2;
      if (dataSheet?.support) return 3;
      if (dataSheet?.battleLine) return 4;
      if (dataSheet?.dedicatedTransport) return 5;
      if (dataSheet?.fortification) return 8;
      return 6;
    };

    const priorityA = getRolePriority(a);
    const priorityB = getRolePriority(b);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    return sortDataSheetAlphabetical(a, b);
  };
};
