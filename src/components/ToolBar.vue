<script setup>
</script>

<template>
  <div class="toolbar">
    <slot></slot>
  </div>
</template>

<style lang="scss">
.toolbar {
  --font-size: 20px;
  align-items: center;
  background-color: var(--color-header);
  border-bottom: 1px solid var(--color-divider);
  box-sizing: border-box;
  color: var(--color-text);
  display: flex;
  flex-direction: row;
  font-family: var(--font-display);
  height: 44px;
  justify-content: space-between;
  gap: 4px;
  position: relative;
  z-index: 3;

  input,
  select {
    background-color: var(--color-surface);
    border: 1px solid var(--color-divider);
    border-radius: 2px;
    color: var(--color-text);
    font-family: var(--font-display);
    font-size: 18px;
    padding: 5px 8px;

    option {
      background-color: var(--color-surface);
      color: var(--color-text);
    }

    &::placeholder {
      color: var(--color-text-muted);
    }

    &:focus {
      border-color: var(--color-accent);
      outline: none;
    }
  }

  &__button {
    align-items: center;
    background: var(--color-surface);
    border: 1px solid var(--color-divider);
    border-radius: 2px;
    color: var(--color-text);
    cursor: pointer;
    display: flex;
    flex-direction: row;
    font-family: var(--font-display);
    font-size: 16px;
    gap: 8px;
    justify-content: center;
    letter-spacing: 0.5px;
    padding: 7px 12px;
    margin: 0 4px;
    text-transform: uppercase;

    &:hover {
      background: var(--color-header);
      border-color: var(--color-accent);
    }
  }

  &__icon {
    fill: currentColor;
    height: 17px;
    width: 17px;
  }

  &__group {
    align-items: center;
    box-sizing: border-box;
    display: flex;
    flex-direction: row;
    flex-shrink: 1;
    font-size: var(--font-size);
    justify-content: flex-end;
  }

  input[type="checkbox"] {
    width: 1em;
    height: 1em;
  }

  label {
    align-items: center;
    cursor: pointer;
    display: flex;
    flex-direction: row;
    font-size: var(--font-size);
  }
}
</style>
