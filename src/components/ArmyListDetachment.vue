<script setup>
import { useArmyListStore } from "../stores/armyList";

const armyListStore = useArmyListStore();

const props = defineProps({
  name: String,
  dp: Number,
  role: { type: Object, default: null },
});

function remove() {
  armyListStore.removeDetachment(props.name);
}
</script>

<template>
  <div
    class="army-list-detachment"
    :title="props.role ? `${props.name} — ${props.role.name}` : props.name"
    :style="props.role ? { backgroundColor: props.role.color, borderColor: 'transparent' } : null"
    :class="{ 'army-list-detachment--has-role': !!props.role }"
  >
    <span class="army-list-detachment__name">{{ props.name }}</span>
    <span class="army-list-detachment__badge">{{ props.dp }}DP</span>
    <button
      type="button"
      class="army-list-detachment__remove"
      @click="remove"
      aria-label="Remove detachment"
    >
      ×
    </button>
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
  cursor: move;
  display: flex;
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  height: 24px;
  letter-spacing: 0.5px;
  padding: 0 6px;
  text-transform: uppercase;

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

  &__remove {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0 4px;

    &:hover {
      color: var(--color-negative);
    }
  }

  &--has-role {
    color: #fff;

    .army-list-detachment__badge {
      background-color: rgba(0, 0, 0, 0.35);
      color: #fff;
    }

    .army-list-detachment__remove {
      color: rgba(255, 255, 255, 0.65);

      &:hover {
        color: #fff;
      }
    }
  }
}
.sortable-ghost {
  opacity: 0;
}
</style>
