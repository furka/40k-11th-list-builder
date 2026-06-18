<script setup>
import { computed } from "vue";
import { useDetachmentDragStore } from "../stores/detachmentDrag";
import ArmyListDetachment from "./ArmyListDetachment.vue";

const dragStore = useDetachmentDragStore();

const style = computed(() => {
  if (!dragStore.draggedName) return null;
  const x = dragStore.pointer.x - dragStore.ghostOffset.x;
  const y = dragStore.pointer.y - dragStore.ghostOffset.y;
  return {
    transform: `translate(${x}px, ${y}px)`,
    width: dragStore.ghostSize.width
      ? `${dragStore.ghostSize.width}px`
      : "auto",
  };
});
</script>

<template>
  <div
    v-if="dragStore.draggedName && dragStore.ghost"
    class="detachment-drag-ghost"
    :style="style"
  >
    <ArmyListDetachment
      :name="dragStore.ghost.name"
      :dp="dragStore.ghost.dp"
      :role="dragStore.ghost.role"
      :index="0"
      readonly
    />
  </div>
</template>

<style scoped lang="scss">
.detachment-drag-ghost {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  box-sizing: border-box;
  left: 0;
  opacity: 1;
  pointer-events: none;
  position: fixed;
  top: 0;
  z-index: 1001;
}
</style>
