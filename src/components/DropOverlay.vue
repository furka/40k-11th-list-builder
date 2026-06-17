<script setup>
import { computed } from "vue";
import { useDragStore } from "../stores/drag";
import InsertionLine from "./InsertionLine.vue";

const dragStore = useDragStore();

/**
 * Draws the insertion line when the active slot is a reorder slot.
 *
 * Attach-target highlighting lives on the row itself (army-list-unit
 * --attach-target class via dragStore.activeSlot). The bin tint lives on the
 * codex panel (see ArmyCodex.vue). This overlay only owns the insertion line.
 */
const line = computed(() => {
  const slot = dragStore.activeSlot;
  if (slot?.type !== "reorder" || !slot.anchorRect) return null;
  const y =
    slot.anchorEdge === "top" ? slot.anchorRect.top : slot.anchorRect.bottom;
  return {
    top: y - 1,
    left: slot.anchorRect.left,
    width: slot.anchorRect.right - slot.anchorRect.left,
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
