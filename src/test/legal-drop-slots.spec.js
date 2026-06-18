import { describe, it, expect } from "vitest";
import { legalDropSlots, pickActiveSlot } from "../utils/legal-drop-slots";

const SHEETS = {
  "NECRON WARRIORS": { name: "NECRON WARRIORS", battleLine: true },
  IMMORTALS: { name: "IMMORTALS", battleLine: true },
  LYCHGUARD: { name: "LYCHGUARD" },
  "DOOMSDAY ARK": { name: "DOOMSDAY ARK" },
  IMOTEKH: {
    name: "IMOTEKH",
    character: true,
    epicHero: true,
    leader: { attachesTo: ["IMMORTALS", "LYCHGUARD", "NECRON WARRIORS"] },
  },
  OVERLORD: {
    name: "OVERLORD",
    character: true,
    leader: { attachesTo: ["NECRON WARRIORS"] },
  },
  CHRONOMANCER: {
    name: "CHRONOMANCER",
    character: true,
    support: { attachesTo: ["IMMORTALS", "NECRON WARRIORS"] },
  },
  PLASMANCER: {
    name: "PLASMANCER",
    character: true,
    support: { attachesTo: ["NECRON WARRIORS"] },
  },
  Enhancements: { name: "Enhancements", enhancements: true },
};
const getDataSheet = (name) => SHEETS[name] ?? null;

const u = (id, name, attachedTo) => ({ id, name, attachedTo });
const enh = (id, optionName, attachedTo) => ({
  id,
  name: "Enhancements",
  optionName,
  attachedTo,
});

const byType = (slots, type) => slots.filter((s) => s.type === type);
const attachIds = (slots) => byType(slots, "attach").map((s) => s.hostId).sort();
const reorderKeys = (slots) => byType(slots, "reorder").map((s) => s.key).sort();

describe("legalDropSlots — defensive", () => {
  it("returns [] when draggedId is not in units", () => {
    expect(legalDropSlots([u("a", "IMOTEKH")], "ghost", getDataSheet)).toEqual([]);
  });

  it("always emits a bin slot", () => {
    const units = [u("a", "IMOTEKH"), u("b", "NECRON WARRIORS")];
    expect(byType(legalDropSlots(units, "a", getDataSheet), "bin")).toEqual([
      { type: "bin", key: "bin" },
    ]);
  });

  it("always emits root reorder slots, even for an unattachable bodyguard", () => {
    const units = [
      u("w1", "NECRON WARRIORS"),
      u("w2", "NECRON WARRIORS"),
      u("w3", "NECRON WARRIORS"),
    ];
    // Dragging w1: root has 2 _other_ root units → 3 reorder slots (above each
    // + below last). Plus zero attach slots (warriors are not attachable).
    const slots = legalDropSlots(units, "w1", getDataSheet);
    expect(attachIds(slots)).toEqual([]);
    expect(byType(slots, "reorder").filter((s) => s.parentId === null)).toHaveLength(3);
  });
});

describe("legalDropSlots — leader rules", () => {
  it("emits attach slots only for hosts in leader.attachesTo", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("im", "IMMORTALS"),
      u("d", "DOOMSDAY ARK"),
      u("o", "OVERLORD"),
    ];
    // OVERLORD.leader.attachesTo = ["NECRON WARRIORS"] → only w is valid.
    expect(attachIds(legalDropSlots(units, "o", getDataSheet))).toEqual(["w"]);
  });

  it("rejects a second leader on a host that already has one (max-1 leader)", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH", "w"),
      u("o", "OVERLORD"),
    ];
    // w already has IMOTEKH attached; OVERLORD cannot also attach to w.
    expect(attachIds(legalDropSlots(units, "o", getDataSheet))).toEqual([]);
  });

  it("allows a leader to be re-dropped on its current host (self-exempt)", () => {
    const units = [u("w", "NECRON WARRIORS"), u("imo", "IMOTEKH", "w")];
    expect(attachIds(legalDropSlots(units, "imo", getDataSheet))).toEqual(["w"]);
  });
});

describe("legalDropSlots — support rules", () => {
  it("emits attach slots only for hosts in support.attachesTo", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("l", "LYCHGUARD"),
      u("c", "CHRONOMANCER"),
    ];
    // CHRONOMANCER.support.attachesTo = ["IMMORTALS", "NECRON WARRIORS"]
    expect(attachIds(legalDropSlots(units, "c", getDataSheet))).toEqual(["w"]);
  });

  it("rejects a second support on a host that already has one (max-1 support)", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("c", "CHRONOMANCER", "w"),
      u("p", "PLASMANCER"),
    ];
    expect(attachIds(legalDropSlots(units, "p", getDataSheet))).toEqual([]);
  });

  it("allows a leader + a support on the same host (different cardinality buckets)", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH", "w"),
      u("c", "CHRONOMANCER"),
    ];
    // CHRONOMANCER attaches to w (which has 1 leader, 0 supports) — fine.
    expect(attachIds(legalDropSlots(units, "c", getDataSheet))).toEqual(["w"]);
  });
});

describe("legalDropSlots — enhancement rules", () => {
  it("attaches to any host (bodyguard or character)", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH"),
      u("d", "DOOMSDAY ARK"),
      enh("e", "Veil of Darkness"),
    ];
    expect(attachIds(legalDropSlots(units, "e", getDataSheet))).toEqual(
      ["d", "imo", "w"].sort()
    );
  });

  it("attaches to a character that is itself attached to a unit (depth 2)", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH", "w"),
      enh("e", "Veil of Darkness"),
    ];
    // Allowed: enhancement → leader → unit. enhancementCount on imo = 0.
    expect(attachIds(legalDropSlots(units, "e", getDataSheet))).toContain("imo");
  });

  it("rejects a second enhancement on a host that already has one (max-1 enh per host)", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH", "w"),
      enh("e1", "Veil of Darkness", "imo"),
      enh("e2", "Arisen Tyrant"),
    ];
    // imo already has e1; e2 cannot also attach to imo.
    expect(attachIds(legalDropSlots(units, "e2", getDataSheet))).not.toContain("imo");
  });

  // 25.04 "No unit (including attached units) can have more than one
  // enhancement." A Leader attached to a Bodyguard squad share one attached
  // unit — any enhancement anywhere in that tree blocks a second.
  it("rejects a second enhancement anywhere in the attached unit (squad+attached leader share a tree)", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH", "w"),
      enh("e1", "Veil of Darkness", "imo"),
      enh("e2", "Arisen Tyrant"),
    ];
    // e1 sits on the attached leader; e2 should not be allowed to attach to
    // the squad itself either, since both share one attached unit.
    const ids = attachIds(legalDropSlots(units, "e2", getDataSheet));
    expect(ids).not.toContain("w");
    expect(ids).not.toContain("imo");
  });

  it("still allows enhancements on a SEPARATE attached unit", () => {
    const units = [
      u("w1", "NECRON WARRIORS"),
      u("w2", "NECRON WARRIORS"),
      u("imo", "IMOTEKH", "w1"),
      enh("e1", "Veil of Darkness", "imo"),
      enh("e2", "Arisen Tyrant"),
    ];
    // e1 is on imo (attached to w1). w2 is a different attached unit with no
    // enhancements — e2 must still be droppable onto w2.
    expect(attachIds(legalDropSlots(units, "e2", getDataSheet))).toContain("w2");
  });

  it("rejects enhancement-on-enhancement universally (no attach slot to an enh host)", () => {
    // Even at depth 0 — i.e. an unattached enhancement at root — another
    // enhancement should not be allowed to attach to it.
    const units = [
      u("w", "NECRON WARRIORS"),
      enh("e1", "Veil of Darkness"),
      enh("e2", "Arisen Tyrant"),
    ];
    expect(attachIds(legalDropSlots(units, "e2", getDataSheet))).not.toContain("e1");
  });

  it("emits no root reorder slots for a dragged enhancement (must always be attached)", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH"),
      enh("e", "Veil of Darkness"),
    ];
    const slots = legalDropSlots(units, "e", getDataSheet);
    const rootReorders = byType(slots, "reorder").filter(
      (s) => s.parentId === null
    );
    expect(rootReorders).toEqual([]);
  });
});

describe("legalDropSlots — enhancement host rules (with metadata)", () => {
  // Enhancements default to unrestricted: every host is legal unless a
  // restriction field on the metadata says otherwise. Each restriction
  // field is opt-in; falsy/missing = no check.

  it("nonCharacterOnly narrows attach slots to non-character hosts", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("im", "IMMORTALS"),
      u("imo", "IMOTEKH"), // character
      enh("e", "Enlivened Sentinels"),
    ];
    const meta = { name: "Enlivened Sentinels", nonCharacterOnly: true };
    expect(
      attachIds(legalDropSlots(units, "e", getDataSheet, meta))
    ).toEqual(["im", "w"]);
  });

  it("characterOnly narrows attach slots to character hosts", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("im", "IMMORTALS"),
      u("imo", "IMOTEKH"), // character
      u("chr", "CHRONOMANCER"), // character (support)
      enh("e", "Dimensional Overseer"),
    ];
    const meta = { name: "Dimensional Overseer", characterOnly: true };
    expect(
      attachIds(legalDropSlots(units, "e", getDataSheet, meta))
    ).toEqual(["chr", "imo"]);
  });

  it("allowedHosts narrows to specific datasheet names, independent of other flags", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("im", "IMMORTALS"),
      enh("e", "Enlivened Sentinels"),
    ];
    const meta = {
      name: "Enlivened Sentinels",
      nonCharacterOnly: true,
      allowedHosts: ["NECRON WARRIORS"],
    };
    expect(
      attachIds(legalDropSlots(units, "e", getDataSheet, meta))
    ).toEqual(["w"]);
  });

  it("requiredKeywords alone is dormant: enhancement attaches to any host", () => {
    // The validator records requiredKeywords as captured-but-not-enforced.
    // Until datasheet keyword tracking lands, units pass through.
    const units = [
      u("w", "NECRON WARRIORS"),
      u("im", "IMMORTALS"),
      enh("e", "Slaughterthirst"),
    ];
    const meta = {
      name: "Slaughterthirst",
      requiredKeywords: ["LEGIONES DAEMONICA KHORNE"],
    };
    expect(
      attachIds(legalDropSlots(units, "e", getDataSheet, meta))
    ).toEqual(["im", "w"]);
  });

  it("allowedHosts is suppressed when requiredKeywords is also present", () => {
    // All-or-none enforcement: the captured rule was a disjunction
    // (Captain OR Adeptus Astartes Terminator model only) and we can't check
    // the keyword half yet, so the validator skips the datasheet half too
    // rather than under-permitting. Any host is allowed.
    const units = [
      u("w", "NECRON WARRIORS"),
      u("im", "IMMORTALS"),
      enh("e", "Mixed Restriction"),
    ];
    const meta = {
      name: "Mixed Restriction",
      allowedHosts: ["NECRON WARRIORS"],
      requiredKeywords: ["ADEPTUS ASTARTES TERMINATOR"],
    };
    expect(
      attachIds(legalDropSlots(units, "e", getDataSheet, meta))
    ).toEqual(["im", "w"]);
  });

  it("an enhancement with no restriction fields can attach to any host", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH"),
      enh("e", "Veil of Darkness"),
    ];
    const meta = { name: "Veil of Darkness" };
    expect(attachIds(legalDropSlots(units, "e", getDataSheet, meta))).toEqual(
      ["imo", "w"]
    );
  });

  it("notOnEpicHeroes excludes epic heroes (but allows ordinary characters)", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH"), // character + epicHero
      u("o", "OVERLORD"), // character, not epic
      enh("e", "Restricted Enh"),
    ];
    const meta = {
      name: "Restricted Enh",
      characterOnly: true,
      notOnEpicHeroes: true,
    };
    expect(attachIds(legalDropSlots(units, "e", getDataSheet, meta))).toEqual([
      "o",
    ]);
  });

  it("falls back to free-form host when enhancementMeta is omitted", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH"),
      enh("e", "Veil of Darkness"),
    ];
    expect(attachIds(legalDropSlots(units, "e", getDataSheet))).toEqual(
      ["imo", "w"]
    );
  });
});

describe("legalDropSlots — wargear rules", () => {
  const wgr = (id, parentDataSheet, attachedTo) => ({
    id,
    name: "Wargear",
    parentDataSheet,
    optionName: "Bombast field gun",
    attachedTo,
  });

  it("only emits attach slots whose host datasheet matches parentDataSheet", () => {
    const units = [
      u("w1", "NECRON WARRIORS"),
      u("w2", "NECRON WARRIORS"),
      u("im", "IMMORTALS"),
      u("d", "DOOMSDAY ARK"),
      wgr("wo", "NECRON WARRIORS"),
    ];
    expect(attachIds(legalDropSlots(units, "wo", getDataSheet))).toEqual(
      ["w1", "w2"].sort()
    );
  });

  it("allows multiple wargear on the same host (no per-host cap)", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      wgr("wo1", "NECRON WARRIORS", "w"),
      wgr("wo2", "NECRON WARRIORS"),
    ];
    expect(attachIds(legalDropSlots(units, "wo2", getDataSheet))).toContain("w");
  });

  it("emits zero attach slots when no host matches parentDataSheet", () => {
    const units = [
      u("im", "IMMORTALS"),
      u("d", "DOOMSDAY ARK"),
      wgr("wo", "NECRON WARRIORS"),
    ];
    expect(attachIds(legalDropSlots(units, "wo", getDataSheet))).toEqual([]);
  });

  it("does NOT count wargear toward the enhancement-per-host cap", () => {
    // imo already has 1 wargear attached. A dragged enhancement should still
    // be allowed onto imo because wargear lives in its own cardinality bucket.
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH", "w"),
      wgr("wo", "IMOTEKH", "imo"),
      enh("e", "Veil of Darkness"),
    ];
    expect(attachIds(legalDropSlots(units, "e", getDataSheet))).toContain("imo");
  });

  it("emits NO root reorder slots — wargear must stay attached to a host", () => {
    const units = [
      u("w1", "NECRON WARRIORS"),
      u("w2", "NECRON WARRIORS"),
      wgr("wo", "NECRON WARRIORS", "w1"),
    ];
    const slots = legalDropSlots(units, "wo", getDataSheet);
    expect(byType(slots, "reorder").filter((s) => s.parentId === null)).toEqual(
      []
    );
    // Bin remains available so the user can drag-to-delete a wargear.
    expect(byType(slots, "bin")).toHaveLength(1);
  });

  it("rejects a maxed host as an attach target (placeholder cap = 20)", () => {
    // The synthetic NECRON WARRIORS datasheet doesn't carry wargearOptions in
    // this spec's SHEETS map — that's fine for the cap check because
    // `wargearMaxPerUnit(undefined)` falls back to the default constant (20).
    const units = [u("w1", "NECRON WARRIORS"), u("w2", "NECRON WARRIORS")];
    // Saturate w1 with 20 copies of the same option already attached.
    for (let i = 0; i < 20; i++) {
      units.push(wgr(`a${i}`, "NECRON WARRIORS", "w1"));
    }
    const dragged = wgr("drag", "NECRON WARRIORS"); // unattached
    units.push(dragged);
    const slots = legalDropSlots(units, "drag", getDataSheet);
    // w2 is free, w1 is maxed.
    expect(attachIds(slots)).toEqual(["w2"]);
  });

  it("self-exempts the dragged wargear from its own host's count", () => {
    // w1 has 20 copies of this option attached. The 20th one is dragged.
    // It should be allowed to re-drop on w1 — its OWN row is excluded from
    // the cap count, so w1's effective count is 19 when judging the drop.
    const units = [u("w1", "NECRON WARRIORS"), u("w2", "NECRON WARRIORS")];
    for (let i = 0; i < 20; i++) {
      units.push(wgr(`a${i}`, "NECRON WARRIORS", "w1"));
    }
    const draggedId = "a0";
    const slots = legalDropSlots(units, draggedId, getDataSheet);
    expect(attachIds(slots)).toEqual(["w1", "w2"].sort());
  });
});

describe("legalDropSlots — structural rules", () => {
  it("never attaches a regular unit to anything", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH"),
      u("w2", "NECRON WARRIORS"),
    ];
    // w2 is a battleline bodyguard — has no leader/support flag, isn't an
    // enhancement. Must produce zero attach slots.
    expect(attachIds(legalDropSlots(units, "w2", getDataSheet))).toEqual([]);
  });

  it("rejects self-drop", () => {
    const units = [u("imo", "IMOTEKH"), u("w", "NECRON WARRIORS")];
    const slots = legalDropSlots(units, "imo", getDataSheet);
    expect(byType(slots, "attach").map((s) => s.hostId)).not.toContain("imo");
  });

  it("rejects dropping a host onto its own descendant (cycle)", () => {
    // imo (leader) currently has enh attached. Dragging imo onto enh would
    // cycle. (Edge case: leaders don't usually become hosts to enhancements
    // in this direction, but the rule applies to any tree.)
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH", "w"),
      enh("e1", "Veil of Darkness", "imo"),
    ];
    expect(attachIds(legalDropSlots(units, "imo", getDataSheet))).not.toContain("e1");
  });

  it("rejects drops that would exceed depth 3 via the dragged unit's own subtree", () => {
    // imo carries an enhancement → dragged subtree depth = 1.
    // Attaching imo (with its subtree) under a host at depth 1 would land enh
    // at depth 3, which is too deep.
    const units = [
      u("w1", "NECRON WARRIORS"),
      u("w2", "NECRON WARRIORS"),
      u("imo", "IMOTEKH"),
      enh("e1", "Veil of Darkness", "imo"),
      // construct a host at depth 1: leader attached to w1
      u("o", "OVERLORD", "w1"),
    ];
    // o is at depth 1. Attaching imo (subtreeDepth=1) under o would land e1
    // at depth 3 → must be rejected. Also OVERLORD is a leader so the
    // max-1-leader rule on w1 doesn't apply (we're testing imo onto o, not
    // imo onto w1).
    // Note: imo can still attach to w2 (root) directly.
    const slots = legalDropSlots(units, "imo", getDataSheet);
    expect(attachIds(slots)).not.toContain("o");
    expect(attachIds(slots)).toContain("w2");
  });
});

describe("legalDropSlots — reorder slot enumeration", () => {
  it("emits N+1 root reorder slots for N other root units", () => {
    const units = [
      u("a", "IMOTEKH"),
      u("b", "NECRON WARRIORS"),
      u("c", "NECRON WARRIORS"),
      u("d", "NECRON WARRIORS"),
    ];
    // Dragging a: 3 other root units → 4 root reorder slots.
    const slots = legalDropSlots(units, "a", getDataSheet);
    const rootReorders = byType(slots, "reorder").filter(
      (s) => s.parentId === null
    );
    expect(rootReorders).toHaveLength(4);
    expect(rootReorders.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("emits M+1 reorder slots under each legal host", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH", "w"),
      u("c", "CHRONOMANCER", "w"),
      enh("e", "Veil"),
    ];
    // Dragging e (enhancement). It can attach to w, imo, c.
    // Under w: there are 2 children (imo + c), e isn't currently a child → 3 reorder slots under w.
    // Under imo: 0 children → 1 reorder slot under imo.
    // Under c: 0 children → 1 reorder slot under c.
    const slots = legalDropSlots(units, "e", getDataSheet);
    const underW = byType(slots, "reorder").filter((s) => s.parentId === "w");
    const underImo = byType(slots, "reorder").filter((s) => s.parentId === "imo");
    const underC = byType(slots, "reorder").filter((s) => s.parentId === "c");
    expect(underW).toHaveLength(3);
    expect(underImo).toHaveLength(1);
    expect(underC).toHaveLength(1);
  });

  it("excludes the dragged unit from sibling counts under its current parent", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH", "w"),
      enh("e1", "A", "w"),
      enh("e2", "B"),
    ];
    // Dragging imo, which is currently a child of w. w's other children
    // (excluding imo) = [e1] → 2 reorder slots under w.
    const slots = legalDropSlots(units, "imo", getDataSheet);
    const underW = byType(slots, "reorder").filter((s) => s.parentId === "w");
    expect(underW).toHaveLength(2);
  });

  it("uses stable, distinct keys across all slots", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH"),
    ];
    const slots = legalDropSlots(units, "imo", getDataSheet);
    const keys = slots.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("legalDropSlots — attach-slot parent metadata", () => {
  it("attach slot at root carries parentKey='root' and dragged-excluded index", () => {
    const units = [
      u("w1", "NECRON WARRIORS"),
      u("w2", "NECRON WARRIORS"),
      u("imo", "IMOTEKH"),
    ];
    const slots = legalDropSlots(units, "imo", getDataSheet);
    const attachToW1 = slots.find((s) => s.type === "attach" && s.hostId === "w1");
    const attachToW2 = slots.find((s) => s.type === "attach" && s.hostId === "w2");
    expect(attachToW1).toMatchObject({ parentKey: "root", indexInParent: 0 });
    expect(attachToW2).toMatchObject({ parentKey: "root", indexInParent: 1 });
  });

  it("attach slot under a nested host carries the host's parent id and dragged-excluded index", () => {
    const units = [
      u("w", "NECRON WARRIORS"),
      u("imo", "IMOTEKH", "w"),
      enh("e", "Veil"),
    ];
    const slots = legalDropSlots(units, "e", getDataSheet);
    const attachToImo = slots.find((s) => s.type === "attach" && s.hostId === "imo");
    expect(attachToImo).toMatchObject({ parentKey: "w", indexInParent: 0 });
  });
});

describe("pickActiveSlot — row-based hit test", () => {
  // Synthetic row at y=100..140 (40px tall, 100px wide).
  const ROW_RECT = { left: 0, right: 100, top: 100, bottom: 140 };
  const BIN_RECT = { left: 500, right: 700, top: 0, bottom: 1000 };
  const fakeEl = (rect) => ({ getBoundingClientRect: () => rect });

  const slots = [
    {
      type: "attach",
      hostId: "w",
      parentKey: "root",
      indexInParent: 0,
      key: "attach:w",
    },
    { type: "reorder", parentId: null, index: 0, key: "reorder:root:0" },
    { type: "reorder", parentId: null, index: 1, key: "reorder:root:1" },
    { type: "bin", key: "bin" },
  ];

  const rows = [
    {
      unitId: "w",
      el: fakeEl(ROW_RECT),
      parentKey: "root",
      indexInParent: 0,
    },
  ];

  const getRect = (key) => (key === "bin" ? BIN_RECT : null);

  it("returns null when no slot is hit", () => {
    expect(
      pickActiveSlot({ legalSlots: slots, getRect, rows, pointer: { x: 300, y: 300 } })
    ).toBeNull();
  });

  it("bin wins when pointer is over the bin rect", () => {
    expect(
      pickActiveSlot({ legalSlots: slots, getRect, rows, pointer: { x: 600, y: 500 } })
    ).toEqual({ type: "bin", key: "bin" });
  });

  it("attach wins in the middle 50% of the row", () => {
    const r = pickActiveSlot({ legalSlots: slots, getRect, rows, pointer: { x: 50, y: 120 } });
    expect(r?.type).toBe("attach");
  });

  it("top 25% of row routes to the 'above' reorder slot with top anchor", () => {
    // top 25% = y=100..110
    const r = pickActiveSlot({ legalSlots: slots, getRect, rows, pointer: { x: 50, y: 105 } });
    expect(r).toMatchObject({
      type: "reorder",
      parentId: null,
      index: 0,
      anchorEdge: "top",
    });
    expect(r.anchorRect).toEqual(ROW_RECT);
  });

  it("bottom 25% of row routes to the 'below' reorder slot with bottom anchor", () => {
    const r = pickActiveSlot({ legalSlots: slots, getRect, rows, pointer: { x: 50, y: 135 } });
    expect(r).toMatchObject({
      type: "reorder",
      parentId: null,
      index: 1,
      anchorEdge: "bottom",
    });
  });

  it("top edge falls back to the attach slot itself when no 'above' reorder is legal", () => {
    const slotsNoAbove = slots.filter((s) => s.key !== "reorder:root:0");
    const r = pickActiveSlot({
      legalSlots: slotsNoAbove,
      getRect,
      rows,
      pointer: { x: 50, y: 105 },
    });
    expect(r?.type).toBe("attach");
  });

  it("top edge returns null when neither 'above' reorder NOR attach is legal", () => {
    // A row that's only present for reorder routing (not a legal attach
    // target) with no legal 'above' slot either → no actionable drop.
    const slotsNeither = slots.filter(
      (s) => s.key !== "reorder:root:0" && s.key !== "attach:w"
    );
    expect(
      pickActiveSlot({
        legalSlots: slotsNeither,
        getRect,
        rows,
        pointer: { x: 50, y: 105 },
      })
    ).toBeNull();
  });

  it("ignores rows whose el is missing", () => {
    expect(
      pickActiveSlot({
        legalSlots: slots,
        getRect,
        rows: [{ unitId: "w", el: null, parentKey: "root", indexInParent: 0 }],
        pointer: { x: 50, y: 120 },
      })
    ).toBeNull();
  });

  describe("army-list-area fallback (empty space inside the list panel)", () => {
    const LIST_RECT = { left: 0, right: 200, top: 0, bottom: 500 };
    const TOP_ROW = { left: 0, right: 200, top: 400, bottom: 440 };
    const BOTTOM_ROW = { left: 0, right: 200, top: 450, bottom: 490 };

    const listSlots = [
      { type: "reorder", parentId: null, index: 0, key: "reorder:root:0" },
      { type: "reorder", parentId: null, index: 1, key: "reorder:root:1" },
      { type: "reorder", parentId: null, index: 2, key: "reorder:root:2" },
      { type: "bin", key: "bin" },
    ];

    const listRows = [
      {
        unitId: "top",
        el: fakeEl(TOP_ROW),
        parentKey: "root",
        indexInParent: 0,
      },
      {
        unitId: "bot",
        el: fakeEl(BOTTOM_ROW),
        parentKey: "root",
        indexInParent: 1,
      },
    ];

    const listGetRect = (key) => {
      if (key === "bin") return BIN_RECT;
      if (key === "army-list-area") return LIST_RECT;
      return null;
    };

    it("routes empty space above the topmost row to reorder:root:0 anchored on top of the topmost row", () => {
      const r = pickActiveSlot({
        legalSlots: listSlots,
        getRect: listGetRect,
        rows: listRows,
        pointer: { x: 50, y: 100 },
      });
      expect(r).toMatchObject({
        type: "reorder",
        parentId: null,
        index: 0,
        anchorEdge: "top",
      });
      expect(r.anchorRect.top).toBe(TOP_ROW.top);
    });

    it("routes empty space below the bottommost row to reorder:root:N anchored on its bottom", () => {
      const r = pickActiveSlot({
        legalSlots: listSlots,
        getRect: listGetRect,
        rows: listRows,
        pointer: { x: 50, y: 495 },
      });
      expect(r).toMatchObject({
        type: "reorder",
        parentId: null,
        index: 2,
        anchorEdge: "bottom",
      });
    });

    it("returns null when pointer is outside the army-list-area rect", () => {
      // Pointer above the list area entirely.
      expect(
        pickActiveSlot({
          legalSlots: listSlots,
          getRect: listGetRect,
          rows: listRows,
          pointer: { x: 50, y: -50 },
        })
      ).toBeNull();
    });

    it("returns null when the dragged unit can't be placed at root (no reorder:root:N slot)", () => {
      // E.g. wargear — no root reorder slots exist.
      const noRoot = listSlots.filter((s) => !s.key.startsWith("reorder:root:"));
      expect(
        pickActiveSlot({
          legalSlots: noRoot,
          getRect: listGetRect,
          rows: listRows,
          pointer: { x: 50, y: 100 },
        })
      ).toBeNull();
    });

    it("uses sorted-by-rect-top order so the topmost ROOT row anchors the line", () => {
      // Reverse the rows array — fallback must still pick the visually
      // topmost row, not the first one in the array.
      const r = pickActiveSlot({
        legalSlots: listSlots,
        getRect: listGetRect,
        rows: [...listRows].reverse(),
        pointer: { x: 50, y: 100 },
      });
      expect(r?.anchorRect.top).toBe(TOP_ROW.top);
    });
  });
});
