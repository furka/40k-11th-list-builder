<script setup>
import { ref } from "vue";
import CloseIcon from "../assets/close-line-icon.svg";

const props = defineProps({
  title: String,
  attention: { type: Boolean, default: false },
});

const dialog = ref(null);

function openDialog() {
  dialog.value.showModal();
}

function close() {
  dialog.value.close();
}

defineExpose({ close });

// Backdrop dismiss only fires when BOTH press and release land on the dialog
// element itself. Without the press check, a drag-select that starts inside
// the content and releases on the backdrop would close the modal (click
// event bubbles to the nearest common ancestor — the dialog).
let pressOnDialog = false;

function onPointerDown(event) {
  pressOnDialog = event.target === dialog.value;
}

function onPointerUp(event) {
  if (pressOnDialog && event.target === dialog.value) {
    dialog.value.close();
  }
  pressOnDialog = false;
}
</script>

<template>
  <div>
    <button
      class="modal-button"
      :class="{ 'modal-button--attention': props.attention }"
      @click="openDialog"
      v-tooltip="props.title"
    >
      <slot name="button"></slot>
    </button>

    <dialog
      ref="dialog"
      class="modal"
      @close="$emit('closed')"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
    >
      <div class="modal__content">
        <slot name="content"></slot>
      </div>

      <form method="dialog">
        <button class="modal__close" autofocus>
          <CloseIcon class="modal__close-icon" />
        </button>
      </form>
    </dialog>
  </div>
</template>

<style lang="scss">
.modal-button {
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

  &--attention {
    border-color: var(--color-accent);
    color: var(--color-accent);
    animation: modal-button-pulse 1.6s ease-out infinite;
  }

  &__icon {
    fill: currentColor;
    height: 17px;
    width: 17px;
  }
}

@keyframes modal-button-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(232, 162, 58, 0.55);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(232, 162, 58, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(232, 162, 58, 0);
  }
}

.modal {
  background: none;
  border: none;
  box-sizing: border-box;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 16px;
  // The close (X) button sits 40px ABOVE the dialog's top edge (see
  // `&__close { top: -40px }` below). When the dialog centers itself via
  // the browser's default `margin: auto`, a max-height of 95svh leaves
  // only 2.5svh above — not enough for the button. Capping at 100svh − 100px
  // guarantees ≥ 50px above the dialog so the X is always reachable.
  max-height: calc(100svh - 100px);
  max-width: calc(100vw - 16px);
  min-height: 50vh;
  min-width: 50vh;
  overflow: visible;
  position: relative;
  padding: 0;
  cursor: pointer;

  &[open] {
    display: flex;
  }

  &__content {
    background: var(--color-surface);
    border: 1px solid var(--color-divider);
    border-radius: 2px;
    color: var(--color-text);
    padding: 32px;
    overflow-y: auto;
    flex-grow: 1;
    cursor: auto;
  }

  &__close {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    display: flex;
    height: 32px;
    padding: 0;
    position: absolute;
    right: 0;
    top: -40px;
    width: 32px;

    svg {
      height: 100%;
      width: 100%;
      fill: currentColor;
    }

    &:hover {
      color: var(--color-accent);
    }
  }

  &::backdrop {
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
  }
}
</style>
