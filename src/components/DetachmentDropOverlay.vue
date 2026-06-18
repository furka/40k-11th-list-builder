<script setup>
import { computed } from "vue";
import { useDetachmentDragStore } from "../stores/detachmentDrag";
import InsertionLine from "./InsertionLine.vue";

const dragStore = useDetachmentDragStore();

const line = computed(() => {
  const anchor = dragStore.insertAnchorRect;
  if (!anchor) return null;
  const y = anchor.edge === "top" ? anchor.top : anchor.bottom;
  return {
    top: y - 1,
    left: anchor.left,
    width: anchor.right - anchor.left,
  };
});
</script>

<template>
  <InsertionLine
    v-if="line"
    :top="line.top"
    :left="line.left"
    :width="line.width"
  />
</template>
