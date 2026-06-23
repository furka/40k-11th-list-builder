<script setup>
import { computed, onMounted, ref } from "vue";
import CloseIcon from "../assets/close-line-icon.svg";
import { useArmyListStore } from "../stores/armyList";
import { useCodexStore } from "../stores/codex";
import { isBattleLine } from "../utils/is-battleline";
import { hasKeyword } from "../utils/keywords";
import { autoBattlelineSource } from "../utils/conditional-battleline";

const emit = defineEmits(["close"]);

const armyListStore = useArmyListStore();
const codexStore = useCodexStore();

const filter = ref("");
const dialog = ref(null);

onMounted(() => {
  dialog.value?.showModal();
});

function closeAndEmit() {
  dialog.value?.close();
}

const factionDatasheets = computed(() => {
  const all = codexStore.compendium ?? [];
  return all
    .filter(
      (s) =>
        s.faction === armyListStore.faction &&
        !hasKeyword(s, "EPIC HERO") &&
        !isBattleLine(s)
    )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
});

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return factionDatasheets.value;
  return factionDatasheets.value.filter((s) =>
    s.name.toLowerCase().includes(q)
  );
});

function rowStateFor(sheet) {
  if (isBattleLine(sheet)) {
    return { mode: "static", label: "Battleline (always)", on: true, locked: true };
  }
  const list = armyListStore.toObject();
  const auto = autoBattlelineSource(list, sheet.name);
  if (auto) {
    const typeLabel = auto.type === "detachment" ? "detachment" : auto.type;
    return {
      mode: "auto",
      label: `Battleline via ${auto.name} ${typeLabel}`,
      on: true,
      locked: true,
    };
  }
  if ((armyListStore.bonusBattleline ?? []).includes(sheet.name)) {
    return { mode: "manual", label: "Battleline (manual)", on: true, locked: false };
  }
  return { mode: "off", label: "", on: false, locked: false };
}

function toggle(sheet) {
  const state = rowStateFor(sheet);
  if (state.locked) return;
  armyListStore.toggleBonusBattleline(sheet.name);
}

// Backdrop dismiss only when both press and release land on the dialog itself
// (not on a child) — matches the ModalWithButton convention so a drag-select
// inside the modal can't accidentally close it.
let pressOnDialog = false;
function onPointerDown(e) {
  pressOnDialog = e.target === dialog.value;
}
function onPointerUp(e) {
  if (pressOnDialog && e.target === dialog.value) dialog.value.close();
  pressOnDialog = false;
}
</script>

<template>
  <dialog
    ref="dialog"
    class="bl-modal"
    @close="emit('close')"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
  >
    <div class="bl-modal__content">
      <h2 class="bl-modal__title">Battleline overrides</h2>
      <input
        v-model="filter"
        class="bl-modal__filter"
        type="text"
        placeholder="Filter datasheets…"
      />
      <ul class="bl-modal__grid">
        <li
          v-for="sheet in filtered"
          :key="sheet.name"
          class="bl-modal__cell"
          :class="{ 'bl-modal__cell--locked': rowStateFor(sheet).locked }"
        >
          <button
            type="button"
            class="bl-modal__toggle"
            :class="{
              'bl-modal__toggle--on': rowStateFor(sheet).on,
              'bl-modal__toggle--locked': rowStateFor(sheet).locked,
            }"
            :disabled="rowStateFor(sheet).locked"
            :aria-pressed="rowStateFor(sheet).on"
            @click="toggle(sheet)"
            v-tooltip="rowStateFor(sheet).label"
          >
            <span class="bl-modal__toggle-track">
              <span class="bl-modal__toggle-knob" />
            </span>
          </button>
          <span class="bl-modal__name">{{ sheet.name }}</span>
          <span
            v-if="rowStateFor(sheet).label"
            class="bl-modal__status"
          >{{ rowStateFor(sheet).label }}</span>
        </li>
        <li v-if="filtered.length === 0" class="bl-modal__empty">
          No datasheets match "{{ filter }}".
        </li>
      </ul>
    </div>

    <form method="dialog">
      <button class="bl-modal__close" autofocus>
        <CloseIcon class="bl-modal__close-icon" />
      </button>
    </form>
  </dialog>
</template>

<style scoped lang="scss">
.bl-modal {
  background: none;
  border: none;
  box-sizing: border-box;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 14px;
  max-height: calc(100svh - 100px);
  // Fill the viewport (minus a small gutter) so the grid below can pack as
  // many columns as available width allows. No upper cap — the grid's
  // auto-fill minmax handles the visual rhythm at any width.
  width: calc(100vw - 80px);
  min-width: min(90vw, 720px);
  overflow: visible;
  padding: 0;
  position: relative;
  cursor: pointer;

  &[open] {
    display: flex;
  }

  &__content {
    background: var(--color-surface);
    border: 1px solid var(--color-divider);
    border-radius: 2px;
    color: var(--color-text);
    cursor: auto;
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    padding: 24px 28px;
    overflow-y: auto;
  }

  &__title {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 1.2px;
    margin: 0 0 12px 0;
    text-transform: uppercase;
  }

  &__filter {
    background: var(--color-bg);
    border: 1px solid var(--color-divider);
    border-radius: 2px;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 13px;
    margin-bottom: 14px;
    padding: 7px 10px;

    &:focus {
      border-color: var(--color-accent);
      outline: none;
    }
  }

  &__grid {
    display: grid;
    gap: 8px 16px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  &__cell {
    align-items: center;
    column-gap: 10px;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    padding: 6px 0;
    row-gap: 2px;

    &--locked .bl-modal__name {
      color: var(--color-text-muted);
    }
  }

  &__name {
    font-family: var(--font-display);
    font-size: 13px;
    letter-spacing: 0.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  &__status {
    color: var(--color-text-muted);
    font-size: 11px;
    grid-column: 2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__toggle {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;

    &:disabled,
    &--locked {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  &__toggle-track {
    background: var(--color-divider);
    border-radius: 10px;
    display: inline-block;
    height: 16px;
    position: relative;
    transition: background 120ms ease-out;
    width: 30px;
  }
  &__toggle-knob {
    background: var(--color-text);
    border-radius: 50%;
    height: 12px;
    left: 2px;
    position: absolute;
    top: 2px;
    transition: left 120ms ease-out;
    width: 12px;
  }
  &__toggle--on .bl-modal__toggle-track {
    background: var(--color-accent);
  }
  &__toggle--on .bl-modal__toggle-knob {
    background: #0f1923;
    left: 16px;
  }

  &__empty {
    color: var(--color-text-muted);
    grid-column: 1 / -1;
    padding: 18px 4px;
    text-align: center;
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
      fill: currentColor;
      height: 100%;
      width: 100%;
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
