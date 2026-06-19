// Structural / CSS-contract tests for the height-scaling chain.
//
// The pure-math piece is covered in `unit-sizing.spec.js`. What we guard
// against here is the bug that prompted these tests: wrapping `ArmyListUnit`
// in a recursive `ArmyListUnitNode` broke flex-basis because the Node
// wasn't a flex column container, so the inner unit's `flex-basis` no
// longer resolved on the cross axis.
//
// jsdom doesn't resolve v-bind CSS variables or scoped stylesheets, so we
// pair @vue/test-utils mounts (for component structure) with raw source
// inspection (for CSS contracts). Together they catch the structural and
// stylistic regressions that would silently break the visualisation.

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPinia, setActivePinia } from "pinia";

import ArmyListUnit from "../components/ArmyListUnit.vue";
import ArmyListUnitNode from "../components/ArmyListUnitNode.vue";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPONENT = (name) =>
  readFileSync(resolve(__dirname, `../components/${name}.vue`), "utf8");

function freshStore() {
  setActivePinia(createPinia());
}

describe("ArmyListUnit — CSS contract", () => {
  // Reading the component source ensures that whichever way Vue compiles
  // v-bind in <style scoped>, the binding is actually present. A code
  // refactor that drops the flex-basis declaration would silently break
  // every unit rendering at one height.
  const src = COMPONENT("ArmyListUnit");

  it("composes flex-basis as calc(var(--row-baseline...) + v-bind(scaled portion))", () => {
    // The row baseline is inherited via the `--row-baseline` CSS variable set on
    // `.army-list-pane` (with a snapshot reapplied on DragGhost) — see the
    // baseline plumbing in ArmyList.vue, ArmyListUnit.vue, drag store, and
    // DragGhost.vue. The per-row scaled portion is bound via v-bind. Without
    // either piece the row height collapses.
    expect(src).toMatch(/flex-basis:\s*calc\(\s*var\(\s*--row-baseline[^)]*\)\s*\+\s*v-bind\("scaledHeight"\)\s*\)/);
  });

  it("computes the scaled portion as `scaledHeightPx(unitPoints, props.scale)`", () => {
    expect(src).toMatch(/scaledHeightPx\s*\(\s*unitPoints\.value\s*,\s*props\.scale\s*\)/);
  });

  it("declares flex-shrink: 0 so child siblings can't compress the scaled height", () => {
    expect(src).toMatch(/flex-shrink:\s*0/);
  });
});

describe("ArmyListUnit — attach-target highlight", () => {
  // Render-level check for the visual feedback that tells the user
  // "drop here to attach". The class is driven by dragStore.activeSlot.
  beforeEach(freshStore);

  it("applies army-list-unit--attach-target when activeSlot is attach to this unit's id", async () => {
    const { useDragStore } = await import("../stores/drag");
    const { useArmyListStore } = await import("../stores/armyList");

    const drag = useDragStore();
    const army = useArmyListStore();

    const host = {
      id: "host-1",
      name: "NECRON WARRIORS",
      models: 10,
      optionName: "10 models",
    };
    const leader = {
      id: "imotekh",
      name: "IMOTEKH",
    };
    army.setUnits([host, leader]);

    const wrapper = mount(ArmyListUnit, {
      props: { unit: host, scale: 1, parentKey: "root", indexInParent: 0 },
    });
    // jsdom returns a zero rect from getBoundingClientRect by default, so
    // hit-test would never match. Stub the row's rect with something the
    // pointer can land on. useRowEl re-registers this exact element when the
    // drag starts, so the stubbed rect drives the hit-test.
    const rowEl = wrapper.find(".army-list-unit").element;
    rowEl.getBoundingClientRect = () => ({ left: 0, right: 100, top: 100, bottom: 140 });

    expect(
      wrapper.find(".army-list-unit").classes("army-list-unit--attach-target")
    ).toBe(false);

    drag.start({
      unit: leader,
      pointer: { x: 0, y: 0 },
      units: [host, leader],
      getDataSheet: (n) =>
        n === "IMOTEKH"
          ? { name: "IMOTEKH", leader: { attachesTo: ["NECRON WARRIORS"] } }
          : null,
    });
    await wrapper.vm.$nextTick(); // let useRowEl's post-flush watcher register
    drag.updatePointer(50, 120); // middle 50% of the host row
    await wrapper.vm.$nextTick();
    expect(
      wrapper.find(".army-list-unit").classes("army-list-unit--attach-target")
    ).toBe(true);

    drag.cancel();
    await wrapper.vm.$nextTick();
    expect(
      wrapper.find(".army-list-unit").classes("army-list-unit--attach-target")
    ).toBe(false);
  });
});

describe("ArmyListUnit — render structure", () => {
  beforeEach(freshStore);

  it("renders a `.army-list-unit` root with the unit's data-id", () => {
    const unit = {
      id: "abc-123",
      name: "NECRON WARRIORS",
      models: 10,
      optionName: "10 models",
    };
    const wrapper = mount(ArmyListUnit, { props: { unit, scale: 1 } });

    const root = wrapper.find(".army-list-unit");
    expect(root.exists()).toBe(true);
    expect(root.attributes("data-id")).toBe("abc-123");
  });

  it("renders the unit's display name", () => {
    const unit = {
      id: "a",
      name: "DOOMSDAY ARK",
      models: 1,
      optionName: "1 model",
    };
    const wrapper = mount(ArmyListUnit, { props: { unit, scale: 1 } });

    const name = wrapper.find(".army-list-unit__name");
    expect(name.exists()).toBe(true);
    // formatted as "(1) DOOMSDAY ARK — 1 model"
    expect(name.text()).toContain("DOOMSDAY ARK");
  });
});

describe("ArmyListUnitNode — CSS contract", () => {
  // The wrapper needs `display: flex; flex-direction: column` for the inner
  // ArmyListUnit's `flex-basis` (set via v-bind) to take effect — that's the
  // regression we're guarding against. jsdom can't resolve scoped
  // stylesheets, so we assert against the source directly.
  const src = COMPONENT("ArmyListUnitNode");
  const styleBlock = src.split("<style")[1] ?? "";

  it("declares display: flex on .army-list-unit-node", () => {
    expect(styleBlock).toMatch(/display:\s*flex/);
  });

  it("declares flex-direction: column on .army-list-unit-node", () => {
    expect(styleBlock).toMatch(/flex-direction:\s*column/);
  });

  it("declares flex-shrink: 0 on .army-list-unit-node", () => {
    // Without this, the Node compresses when sibling subtrees grow.
    expect(styleBlock).toMatch(/flex-shrink:\s*0/);
  });

  it("indents nested children with padding-left on .army-list-unit-node__children", () => {
    // The children container is the sibling below the host's unit row; the
    // indent is how the visual nesting reads at each depth.
    expect(styleBlock).toMatch(/__children[\s\S]*?padding-left:\s*\d+px/);
  });

  it("collapses the children container when empty (no pointless empty space)", () => {
    // After the drag-over UX took over, the children container should
    // collapse to 0 when this host has no attachments — attaching now
    // happens by hovering the host row, not by aiming at a strip below.
    // The min-height: 0 declaration is what enforces this.
    const match = styleBlock.match(/__children[\s\S]*?min-height:\s*0(?:px)?\s*;/);
    expect(match).not.toBeNull();
  });

  it("declares a `--grouped` modifier with an accent visual cue that spans the whole subtree", () => {
    // The grouping cue must reference the accent color and be implemented
    // with a mechanism that covers the host row AND its attached children.
    // The earlier `box-shadow: inset` was hidden by the host row's own
    // background; now an absolutely-positioned ::before at z-index 4 sits
    // above every row state so the stripe reads continuously down the
    // subtree. Loose assertion: the --grouped block must reference the
    // accent color *somewhere* near it.
    expect(styleBlock).toMatch(/--grouped[\s\S]{0,500}--color-accent/);
  });

  it("the grouping cue is rendered above row hover / attach-target z-index", () => {
    // Row states top out at z-index: 3 (army-list-unit--attach-target).
    // The grouping cue must paint above that, otherwise the host's
    // highlighted-attach background covers it on the leftmost 4px.
    const match = styleBlock.match(/--grouped[\s\S]*?z-index:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(4);
  });
});

describe("ArmyListUnitNode — render structure", () => {
  beforeEach(freshStore);

  it("renders the host's ArmyListUnit directly under .army-list-unit-node", () => {
    const unit = {
      id: "host",
      name: "NECRON WARRIORS",
      models: 10,
      optionName: "10 models",
    };
    const wrapper = mount(ArmyListUnitNode, {
      props: { unit, scale: 1, depth: 0 },
    });

    expect(wrapper.find(".army-list-unit-node").exists()).toBe(true);
    expect(
      wrapper.find(".army-list-unit-node > .army-list-unit").exists()
    ).toBe(true);
  });

  it("renders a sibling .army-list-unit-node__children drop zone for attachments", () => {
    const unit = {
      id: "host",
      name: "NECRON WARRIORS",
      models: 10,
      optionName: "10 models",
    };
    const wrapper = mount(ArmyListUnitNode, {
      props: { unit, scale: 1, depth: 0 },
    });

    expect(wrapper.find(".army-list-unit-node__children").exists()).toBe(true);
  });

  it("does NOT apply --grouped when the host has no attachments", async () => {
    const { useArmyListStore } = await import("../stores/armyList");
    const store = useArmyListStore();
    const host = {
      id: "lone",
      name: "NECRON WARRIORS",
      models: 10,
      optionName: "10 models",
    };
    store.setUnits([host]);
    const wrapper = mount(ArmyListUnitNode, {
      props: { unit: host, scale: 1, depth: 0 },
    });
    expect(
      wrapper
        .find(".army-list-unit-node")
        .classes("army-list-unit-node--grouped")
    ).toBe(false);
  });

  it("applies --grouped when the host has at least one attached child", async () => {
    const { useArmyListStore } = await import("../stores/armyList");
    const store = useArmyListStore();
    const host = {
      id: "host",
      name: "NECRON WARRIORS",
      models: 10,
      optionName: "10 models",
    };
    const child = {
      id: "kid",
      name: "IMOTEKH THE STORMLORD",
      models: 1,
      optionName: "1 model",
      attachedTo: "host",
    };
    store.setUnits([host, child]);
    const wrapper = mount(ArmyListUnitNode, {
      props: { unit: host, scale: 1, depth: 0 },
    });
    expect(
      wrapper
        .find(".army-list-unit-node")
        .classes("army-list-unit-node--grouped")
    ).toBe(true);
  });
});
