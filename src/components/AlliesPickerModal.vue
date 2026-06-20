<script setup>
import { computed, ref } from "vue";
import CloseIcon from "../assets/close-line-icon.svg";
import { useArmyListStore } from "../stores/armyList";
import { useMfmStore } from "../stores/mfm";

const armyListStore = useArmyListStore();
const mfmStore = useMfmStore();

const dialog = ref(null);

const availableFactions = computed(() => {
  const all = (mfmStore.MFM.CURRENT?.FACTIONS ?? []).map((f) => f.name);
  return all
    .filter((name) => name !== armyListStore.faction)
    .sort();
});

function open() {
  dialog.value?.showModal();
}

function close() {
  dialog.value?.close();
}

function isChecked(name) {
  return armyListStore.allies.includes(name);
}

function toggle(name) {
  const next = isChecked(name)
    ? armyListStore.allies.filter((n) => n !== name)
    : [...armyListStore.allies, name];
  armyListStore.setAllies(next);
}

let pressOnDialog = false;
function onPointerDown(event) {
  pressOnDialog = event.target === dialog.value;
}
function onPointerUp(event) {
  if (pressOnDialog && event.target === dialog.value) {
    close();
  }
  pressOnDialog = false;
}

defineExpose({ open, close });
</script>

<template>
  <dialog
    ref="dialog"
    class="modal allies-modal"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
  >
    <div class="modal__content">
      <h2>Allied factions</h2>
      <div class="allies-modal__grid">
        <label
          v-for="name in availableFactions"
          :key="name"
          class="allies-modal__card"
          :class="{ 'allies-modal__card--checked': isChecked(name) }"
        >
          <input
            type="checkbox"
            class="allies-modal__checkbox"
            :checked="isChecked(name)"
            @change="toggle(name)"
          />
          <span>{{ name }}</span>
        </label>
      </div>
    </div>

    <form method="dialog">
      <button class="modal__close" autofocus>
        <CloseIcon class="modal__close-icon" />
      </button>
    </form>
  </dialog>
</template>

<style scoped lang="scss">
.allies-modal {
  width: min(900px, calc(100vw - 16px));

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
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
    font-size: 15px;
    gap: 10px;
    letter-spacing: 0.5px;
    min-height: 48px;
    padding: 10px 14px;
    text-transform: uppercase;
    transition: border-color 0.1s, color 0.1s, background-color 0.1s;

    &:hover {
      background-color: var(--color-header);
      border-color: var(--color-accent);
    }

    &--checked {
      background-color: var(--color-header);
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
  }

  &__checkbox {
    accent-color: var(--color-accent);
    cursor: pointer;
    flex-shrink: 0;
    height: 16px;
    width: 16px;
  }
}
</style>
