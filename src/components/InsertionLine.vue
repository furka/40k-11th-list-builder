<script setup>
defineProps({
  top: { type: Number, required: true },
  left: { type: Number, required: true },
  width: { type: Number, required: true },
});
</script>

<template>
  <div
    class="insertion-line"
    :style="{ top: top + 'px', left: left + 'px', width: width + 'px' }"
  />
</template>

<style scoped lang="scss">
.insertion-line {
  background-color: var(--color-accent);
  box-shadow: 0 0 6px var(--color-accent);
  height: 2px;
  pointer-events: none;
  position: fixed;
  z-index: 1000;
}
</style>
