<script setup>
import { computed } from "vue";
import { useDragStore } from "../stores/drag";
import ArmyListUnitNode from "./ArmyListUnitNode.vue";

const dragStore = useDragStore();

// The dragged subtree's root unit. Render it via ArmyListUnitNode (readonly)
// so per-level grouping stripes, indentation, and tier/points all match the
// live list exactly — no parallel ghost-specific renderer to keep in sync.
const rootUnit = computed(() => dragStore.ghostSubtree[0]?.unit ?? null);

const style = computed(() => {
  if (!dragStore.draggedId) return null;
  const x = dragStore.pointer.x - dragStore.ghostOffset.x;
  const y = dragStore.pointer.y - dragStore.ghostOffset.y;
  return {
    transform: `translate(${x}px, ${y}px)`,
    width: dragStore.ghostSize.width
      ? `${dragStore.ghostSize.width}px`
      : "250px",
    // Off-tree mount: the live list's `--row-baseline` doesn't reach here,
    // so re-apply the snapshot taken at drag start. Ghost rows then compose
    // their flex-basis from this baseline + their own scaled portion, matching
    // the live source row's height.
    "--row-baseline": dragStore.rowBaseline,
  };
});
</script>

<template>
  <div v-if="dragStore.draggedId && rootUnit" class="drag-ghost" :style="style">
    <ArmyListUnitNode :unit="rootUnit" :scale="dragStore.scale" :depth="0" readonly />
  </div>
</template>

<style scoped lang="scss">
.drag-ghost {
  border: 1px solid var(--color-accent);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  left: 0;
  opacity: 1;
  pointer-events: none;
  position: fixed;
  top: 0;
  z-index: 1001;
}
</style>
