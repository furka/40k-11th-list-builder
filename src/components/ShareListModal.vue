<script setup>
import ShareIcon from "../assets/document-send-icon.svg";
import { serializeList } from "../utils/serialize-list";
import ModalWithButton from "./ModalWithButton.vue";
import { computed } from "vue";
import { ref } from "vue";
import { useArmyListStore } from "../stores/armyList";

const armyListStore = useArmyListStore();

let feedback = ref("");

const serializedList = computed(() => {
  const list = serializeList(armyListStore.toObject());

  return (
    window.location.protocol +
    "//" +
    window.location.host +
    window.location.pathname +
    list
  );
});

function onClosed() {
  feedback.value = "";
}

function copyToClipboard() {
  console.log("copying to clipboard");
  navigator.permissions.query({ name: "clipboard-write" }).then((result) => {
    if (result.state === "granted" || result.state === "prompt") {
      navigator.clipboard.writeText(serializedList.value).then(
        () => {
          feedback.value = "URL copied to clipboard";
        },
        () => {
          feedback.value = "failed to copy URL to clipboard";
        }
      );
    }
  });
}
</script>

<template>
  <ModalWithButton
    class="share-modal"
    @closed="onClosed"
    title="Share army list via URL"
  >
    <template v-slot:button>
      <ShareIcon class="modal-button__icon" />
      <span>Share</span>
    </template>
    <template v-slot:content>
      <div class="share-modal__content">
        <input
          :value="serializedList"
          @focus="$event.target.select()"
          class="share-modal__url"
        />
        <button class="share-modal__button" @click="copyToClipboard">
          Copy to Clipboard
        </button>
        <span class="share-modal__feedback"> {{ feedback }} </span>
      </div>
    </template>
  </ModalWithButton>
</template>

<style scoped lang="scss">
.share-modal {
  &__content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 100%;
  }

  &__url {
    background-color: var(--color-bg);
    border-radius: 2px;
    border: 1px solid var(--color-divider);
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 12px;
    padding: 8px 10px;
    margin-block-end: 16px;
    margin-block-start: 44px;

    &:focus {
      border-color: var(--color-accent);
      outline: none;
    }
  }
  &__feedback {
    color: var(--color-text-muted);
    text-align: center;
    height: 28px;
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
    margin-block-end: 16px;
    padding: 10px 14px;
    text-transform: uppercase;
    user-select: none;

    &:hover {
      background-color: #f3b14e;
    }

    &:active {
      background-color: var(--color-accent-dim);
    }
  }
}
</style>
