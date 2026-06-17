import { describe, it, expect } from "vitest";
import {
  buildTree,
  depthOf,
  descendantIds,
  canAttach,
} from "../utils/attachment-tree";

const u = (id, attachedTo) => ({ id, name: id, attachedTo });

describe("buildTree", () => {
  it("returns an empty array for no units", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("treats undefined attachedTo as root", () => {
    const units = [u("a"), u("b"), u("c")];
    const tree = buildTree(units);
    expect(tree.map((n) => n.unit.id)).toEqual(["a", "b", "c"]);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it("nests children under their host", () => {
    const units = [u("host"), u("leader", "host"), u("enh", "leader")];
    const tree = buildTree(units);
    expect(tree.length).toBe(1);
    expect(tree[0].unit.id).toBe("host");
    expect(tree[0].children.length).toBe(1);
    expect(tree[0].children[0].unit.id).toBe("leader");
    expect(tree[0].children[0].children[0].unit.id).toBe("enh");
  });

  it("preserves sibling order at each level", () => {
    // Insertion order at root: a (root), b (child of a), c (root), d (child of a)
    const units = [u("a"), u("b", "a"), u("c"), u("d", "a")];
    const tree = buildTree(units);
    expect(tree.map((n) => n.unit.id)).toEqual(["a", "c"]);
    expect(tree[0].children.map((n) => n.unit.id)).toEqual(["b", "d"]);
  });

  it("orphans children with a missing host", () => {
    const units = [u("a"), u("orphan", "ghost")];
    const tree = buildTree(units);
    expect(tree.map((n) => n.unit.id)).toEqual(["a", "orphan"]);
  });
});

describe("depthOf", () => {
  const units = [u("a"), u("b", "a"), u("c", "b"), u("d", "c")];

  it("returns 0 for root units", () => {
    expect(depthOf(units[0], units)).toBe(0);
  });

  it("returns 1, 2, 3 for nested chains", () => {
    expect(depthOf(units[1], units)).toBe(1);
    expect(depthOf(units[2], units)).toBe(2);
    expect(depthOf(units[3], units)).toBe(3);
  });

  it("treats a dangling parent as root", () => {
    const dangling = [u("solo", "ghost")];
    expect(depthOf(dangling[0], dangling)).toBe(0);
  });
});

describe("descendantIds", () => {
  it("returns the transitive descendant set", () => {
    const units = [
      u("a"),
      u("b", "a"),
      u("c", "a"),
      u("d", "b"),
      u("e", "d"),
      u("z"),
    ];
    expect(descendantIds(units[0], units)).toEqual(new Set(["b", "c", "d", "e"]));
    expect(descendantIds(units[1], units)).toEqual(new Set(["d", "e"]));
    expect(descendantIds(units[5], units)).toEqual(new Set());
  });
});

describe("canAttach", () => {
  // Tree: a → b → c (3 levels of depth — c is at depth 2)
  const baseUnits = [u("a"), u("b", "a"), u("c", "b"), u("solo")];

  it("rejects self-drop", () => {
    expect(canAttach(baseUnits[0], baseUnits[0], baseUnits)).toBe(false);
  });

  it("rejects dropping a unit onto its own descendant (cycle)", () => {
    // Dropping a (root) onto its grand-child c would create a cycle
    expect(canAttach(baseUnits[0], baseUnits[2], baseUnits)).toBe(false);
    // Dropping b onto c (b's child) would also cycle
    expect(canAttach(baseUnits[1], baseUnits[2], baseUnits)).toBe(false);
  });

  it("accepts attaching a leaf onto an unrelated root", () => {
    expect(canAttach(baseUnits[3], baseUnits[0], baseUnits)).toBe(true);
  });

  it("rejects drops that would exceed maxDepth=3", () => {
    // Tree: a → b → c (c is at depth 2). Attaching solo under c would put
    // solo at depth 3, the maximum allowed for a 3-level model (depths 0/1/2).
    // Anything deeper is refused.
    const tree = [u("a"), u("b", "a"), u("c", "b"), u("solo")];
    // depth(c)=2, subtreeMaxDepth(solo)=0, so 2 + 1 + 0 = 3 ≤ 3-1 = 2 ? No → refused
    expect(canAttach(tree[3], tree[2], tree)).toBe(false);
    // Attaching solo under b (depth 1) lands solo at depth 2 → OK
    expect(canAttach(tree[3], tree[1], tree)).toBe(true);
  });

  it("rejects drops that would push a child subtree past maxDepth", () => {
    // Subject 'b' carries child 'c'. Attaching b (with its 1-deep subtree)
    // under solo (at root) would land c at depth 2 — OK. But attaching b
    // under a unit that's already at depth 1 would land c at depth 3 — bad.
    const tree = [
      u("a"),
      u("nested", "a"),
      u("b"),
      u("c", "b"),
      u("solo"),
    ];
    // host=solo (depth 0), child=b (subtree 1 deep) → depths land at 1, 2 → OK
    expect(canAttach(tree[2], tree[4], tree)).toBe(true);
    // host=nested (depth 1), child=b (subtree 1 deep) → depths land at 2, 3 → reject
    expect(canAttach(tree[2], tree[1], tree)).toBe(false);
  });
});
