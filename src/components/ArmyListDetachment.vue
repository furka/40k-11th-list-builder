<script setup>
import { computed, ref } from "vue";
import { useDetachmentDragStore } from "../stores/detachmentDrag";
import { useDetachmentRow } from "../composables/useDetachmentRow";

const detachmentDragStore = useDetachmentDragStore();

const props = defineProps({
  name: String,
  dp: Number,
  role: { type: Object, default: null },
  index: { type: Number, default: 0 },
  // When true (rendered inside DetachmentDragGhost), skip drag-source wiring.
  readonly: { type: Boolean, default: false },
});

const rowEl = ref(null);
useDetachmentRow(rowEl, () => (props.readonly ? null : props.name));

const isDragging = computed(
  () => !props.readonly && detachmentDragStore.draggedName === props.name
);

function onPointerDown(e) {
  if (props.readonly) return;
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault();
  const rect = e.currentTarget.getBoundingClientRect();
  detachmentDragStore.start({
    name: props.name,
    fromIndex: props.index,
    pointer: { x: e.clientX, y: e.clientY },
    grabOffset: { x: e.clientX - rect.left, y: e.clientY - rect.top },
    size: { width: rect.width, height: rect.height },
    dp: props.dp,
    role: props.role,
  });
}
</script>

<template>
  <div
    ref="rowEl"
    class="army-list-detachment"
    :class="{
      'army-list-detachment--has-role': !!props.role,
      'army-list-detachment--dragging': isDragging,
    }"
    :title="props.role ? `${props.name} — ${props.role.name}` : props.name"
    :style="props.role ? { backgroundColor: props.role.color, borderColor: 'transparent' } : null"
    @pointerdown="onPointerDown"
  >
    <span class="army-list-detachment__name">{{ props.name }}</span>
    <span class="army-list-detachment__badge">{{ props.dp }}DP</span>
  </div>
</template>

<style scoped lang="scss">
.army-list-detachment {
  align-items: center;
  background-color: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: 2px;
  box-sizing: border-box;
  color: var(--color-text);
  cursor: grab;
  display: flex;
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  height: 24px;
  letter-spacing: 0.5px;
  padding: 0 6px;
  // Prevents touch drag from being interpreted as page-scroll on mobile.
  touch-action: none;
  text-transform: uppercase;
  user-select: none;

  &:active {
    cursor: grabbing;
  }

  &--dragging {
    opacity: 0;
  }

  &__name {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__badge {
    background-color: var(--color-accent-dim);
    border-radius: 2px;
    color: #0f1923;
    font-size: 11px;
    padding: 1px 5px;
  }

  &--has-role {
    color: #fff;

    .army-list-detachment__badge {
      background-color: rgba(0, 0, 0, 0.35);
      color: #fff;
    }
  }
}
</style>
