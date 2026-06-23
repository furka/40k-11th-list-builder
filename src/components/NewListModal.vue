<script setup>
import { computed } from "vue";
import ModalWithButton from "./ModalWithButton.vue";
import NewIcon from "../assets/file-line-icon.svg";
import { useAppStore } from "../stores/app";
import { useMfmStore } from "../stores/mfm";
import { useArmyListStore } from "../stores/armyList";

const appStore = useAppStore();
const mfmStore = useMfmStore();
const armyListStore = useArmyListStore();

const factions = computed(() => {
  const list = mfmStore.MFM.CURRENT.FACTIONS.map((f) => f.name);
  list.sort();
  return list;
});

function selectFaction(name) {
  appStore.newList(name);
}
</script>

<template>
  <ModalWithButton
    class="new-list-modal"
    title="Create a new army list"
    :attention="!armyListStore.faction"
  >
    <template v-slot:button>
      <NewIcon class="modal-button__icon" />
      <span>New</span>
    </template>
    <template v-slot:content>
      <h2>Choose a faction</h2>
      <form method="dialog" class="new-list-modal__grid">
        <button
          v-for="faction in factions"
          :key="faction"
          type="submit"
          class="new-list-modal__card"
          @click="selectFaction(faction)"
        >
          {{ faction }}
        </button>
      </form>
    </template>
  </ModalWithButton>
</template>

<style scoped lang="scss">
.new-list-modal {
  :deep(.modal) {
    width: min(1100px, calc(100vw - 16px));
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
    margin-top: 8px;
  }

  &__card {
    align-items: center;
    background: var(--color-bg);
    border: 1px solid var(--color-divider);
    border-radius: 2px;
    color: var(--color-text);
    cursor: pointer;
    display: flex;
    font-family: var(--font-display);
    font-size: 18px;
    justify-content: center;
    letter-spacing: 0.5px;
    min-height: 80px;
    padding: 12px 16px;
    text-align: center;
    text-transform: uppercase;
    transition: border-color 0.1s, color 0.1s, background-color 0.1s;

    &:hover {
      background-color: var(--color-header);
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
  }
}
</style>
