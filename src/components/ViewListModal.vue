<script setup>
import DocumentIcon from "../assets/text-document-line-icon.svg";
import ModalWithButton from "./ModalWithButton.vue";
import PrintableArmyList from "./PrintableArmyList.vue";
import { ref } from "vue";

const listRef = ref(null);
const feedback = ref("");

function onClosed() {
  feedback.value = "";
}

function printList() {
  window.print();
}

function copyToClipboard() {
  const text = listRef.value?.plainText ?? "";
  navigator.permissions.query({ name: "clipboard-write" }).then((result) => {
    if (result.state === "granted" || result.state === "prompt") {
      navigator.clipboard.writeText(text).then(
        () => {
          feedback.value = "List copied to clipboard";
        },
        () => {
          feedback.value = "failed to copy list to clipboard";
        }
      );
    }
  });
}
</script>

<template>
  <ModalWithButton
    class="view-modal"
    @closed="onClosed"
    title="View printable army list"
  >
    <template v-slot:button>
      <DocumentIcon class="modal-button__icon" />
      <span>View</span>
    </template>
    <template v-slot:content>
      <div class="view-modal__content">
        <PrintableArmyList ref="listRef" />
        <span class="view-modal__feedback">{{ feedback }}</span>
        <div class="view-modal__actions">
          <button class="view-modal__button" @click="printList">Print</button>
          <button class="view-modal__button" @click="copyToClipboard">
            Copy to Clipboard
          </button>
        </div>
      </div>
    </template>
  </ModalWithButton>
</template>

<style scoped lang="scss">
.view-modal {
  &__content {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }
  &__feedback {
    color: var(--color-text-muted);
    text-align: center;
    height: 28px;
    margin-block-start: auto;
  }
  &__actions {
    display: flex;
    gap: 8px;
  }
  &__button {
    background-color: var(--color-accent);
    border-radius: 2px;
    border: none;
    color: #0f1923;
    cursor: pointer;
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 1px;
    padding: 10px 14px;
    text-transform: uppercase;
    user-select: none;
    flex: 1;

    &:hover {
      background-color: #f3b14e;
    }

    &:active {
      background-color: var(--color-accent-dim);
    }
  }
}
</style>
