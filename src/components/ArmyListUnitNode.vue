<script setup>
import { computed } from "vue";
import ArmyListUnit from "./ArmyListUnit.vue";
import { useArmyListStore } from "../stores/armyList";
import { useDragStore } from "../stores/drag";

const props = defineProps({
  unit: Object,
  depth: { type: Number, default: 0 },
  scale: Number,
  // For row-registration metadata — see ArmyListUnit's useRowEl call.
  parentKey: { type: String, default: "root" },
  indexInParent: { type: Number, default: 0 },
  // Pass-through to ArmyListUnit + recursive children: disables drag-store
  // side effects + source-row dimming. Used by DragGhost to render the
  // dragged subtree as the cursor-following clone.
  readonly: { type: Boolean, default: false },
});

const armyListStore = useArmyListStore();
const dragStore = useDragStore();

const children = computed(() =>
  armyListStore.units.filter((u) => u.attachedTo === props.unit.id)
);

// True when this node's host (and therefore its whole subtree) is part of the
// active drag. Lets the opacity cascade fade EVERYTHING in the node — the
// host row, attached children rows, and the --grouped left accent stripe
// (which is a ::before on this node, not on any ArmyListUnit). Gated by
// `readonly` so the ghost copy stays visible.
const isDragging = computed(
  () => !props.readonly && dragStore.draggedSubtreeIds.has(props.unit.id)
);

// For each child, its index among MY dragged-excluded children. The dragged
// child itself gets the index its position WOULD have if it didn't exist —
// the store ignores its registration anyway, so the exact value doesn't
// matter, but using this convention keeps the math identical to legalDropSlots.
const childIndices = computed(() => {
  const out = [];
  let nonDraggedIdx = 0;
  for (const c of children.value) {
    out.push(nonDraggedIdx);
    if (c.id !== dragStore.draggedId) nonDraggedIdx++;
  }
  return out;
});
</script>

<template>
  <div
    class="army-list-unit-node"
    :class="{
      'army-list-unit-node--grouped': children.length > 0,
      'army-list-unit-node--dragging': isDragging,
    }"
  >
    <ArmyListUnit
      :unit="unit"
      :scale="scale"
      :parent-key="parentKey"
      :index-in-parent="indexInParent"
      :readonly="readonly"
    />
    <!--
      Children container is rendered even when empty so existing structural
      tests find it; min-height: 0 keeps it from leaking layout when this
      host has no attachments.
    -->
    <div class="army-list-unit-node__children">
      <ArmyListUnitNode
        v-for="(child, i) in children"
        :key="child.id"
        :unit="child"
        :scale="scale"
        :depth="depth + 1"
        :parent-key="unit.id"
        :index-in-parent="childIndices[i]"
        :readonly="readonly"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.army-list-unit-node {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;

  // When this host has at least one attached child, draw a left accent
  // stripe spanning the whole joined unit (host + all attached children).
  &--grouped {
    position: relative;

    &::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background-color: var(--color-accent-dim);
      pointer-events: none;
      z-index: 4;
    }
  }

  &__children {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    padding-left: 16px;
    min-height: 0;
  }

  &--dragging {
    // Parent-level opacity 0 cascades to the host row, all child rows, and
    // the ::before grouping stripe — the whole subtree disappears so it
    // looks lifted out of the list. Row geometry is preserved (no reflow).
    opacity: 0;
  }
}
</style>
