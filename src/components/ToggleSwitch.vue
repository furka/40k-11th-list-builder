<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: "" },
  tooltip: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue"]);

// Fully controlled: `modelValue` owns the checkbox, never the DOM. We emit the
// intended next value but immediately revert the native input, so the parent
// stays the single source of truth even when it doesn't apply the change — e.g.
// the "Bypass restrictions" switch is forced on while Ctrl is held, so a click
// there only updates the underlying pref and never leaves the DOM desynced.
function onToggle(event) {
  const intended = event.target.checked;
  event.target.checked = props.modelValue;
  emit("update:modelValue", intended);
}
</script>

<template>
  <label v-tooltip="tooltip" class="toggle-switch">
    <input type="checkbox" :checked="modelValue" @change="onToggle" />
    <span class="switch"></span>
    {{ label }}
  </label>
</template>

<style scoped lang="scss">
.toggle-switch {
  align-items: center;
  color: var(--color-text);
  cursor: pointer;
  display: flex;
  flex-direction: row;
  font-family: var(--font-body);
  font-size: 15px;
  gap: 8px;

  input[type="checkbox"] {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .switch {
    flex-shrink: 0;
    position: relative;
    width: 34px;
    height: 18px;
    border-radius: 999px;
    background-color: var(--color-divider);
    transition: background-color 0.15s ease;

    &::after {
      content: "";
      position: absolute;
      top: 2px;
      inset-inline-start: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background-color: var(--color-surface);
      transition: transform 0.15s ease;
    }
  }

  input[type="checkbox"]:checked + .switch {
    background-color: var(--color-accent);

    &::after {
      transform: translateX(16px);
    }
  }

  input[type="checkbox"]:focus-visible + .switch {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}
</style>
