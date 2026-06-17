<script setup>
import OpenIcon from "../assets/computer-folder-open-icon.svg";
import DeleteIcon from "../assets/recycle-bin-line-icon.svg";
import CopyIcon from "../assets/text-documents-line-icon.svg";
import RiskIcon from "../assets/risk-icon.svg";
import ModalWithButton from "./ModalWithButton.vue";
import { computed } from "vue";
import { useArmyListStore } from "../stores/armyList";
import { useMfmStore } from "../stores/mfm";
import { useAppStore } from "../stores/app";
import { computeListPoints } from "../utils/list-points";

const armyListStore = useArmyListStore();
const mfmStore = useMfmStore();
const appStore = useAppStore();

function points(units, list) {
  const mfm = mfmStore.getVersion(list.mfm_version) || mfmStore.MFM.CURRENT;
  return computeListPoints(list, mfm, list.faction).total;
}

function mfmVersion(list) {
  if (!list.mfm_version) return "???";
  return mfmStore.normalizeMfmVersion(list.mfm_version).replace(/^V/, "");
}

const hasCurrent = computed(() => !!armyListStore.faction);

const lists = computed(() => {
  const current = armyListStore.toObject();
  return hasCurrent.value ? [current, ...appStore.lists] : [...appStore.lists];
});

function selectList(list) {
  const currentList = armyListStore.toObject();
  if (list === currentList || JSON.stringify(list) === JSON.stringify(currentList)) {
    return;
  }
  appStore.selectList(list);
}

function copyList(list) {
  appStore.copyList(list);
}

function deleteList(list) {
  appStore.deleteList(list);
}
</script>

<template>
  <ModalWithButton class="open-modal" title="Open saved army lists">
    <template v-slot:button>
      <OpenIcon class="modal-button__icon" />
      <span>Saved</span>
    </template>
    <template v-slot:content>
      <h2>Saved lists</h2>
      <ul>
        <li v-for="(list, index) in lists">
          <form method="dialog">
            <button @click="selectList(list)" class="open-modal__button">
              <span v-if="list.name" class="open-modal__list-name">
                <b>{{ list.name }}</b>
              </span>
              <span class="open-modal__list-details">
                <template v-if="list.name">—</template>
                {{ list.faction }} —
                {{ points(list.units, list) }} pts
                <b v-if="hasCurrent && index === 0"> (current)</b>
              </span>
            </button>
          </form>
          <span class="open-modal__actions">
            <span
              class="open-modal__mfm-version"
              :class="
                mfmStore.isListOutdated(list) ? 'open-modal__mfm-version--outdated' : ''
              "
              :title="
                mfmStore.isListOutdated(list) ? `List has outdated MFM version` : ''
              "
            >
              <span class="open-modal__mfm-label">MFM</span>
              {{ mfmVersion(list) }}
            </span>

            <button
              class="open-modal__copy"
              @click="copyList(list)"
              title="Duplicate list"
            >
              <CopyIcon />
            </button>
            <button
              class="open-modal__delete"
              @click="deleteList(list)"
              title="DELETE LIST?"
              :disabled="hasCurrent && index === 0"
            >
              <DeleteIcon />
            </button>
          </span>
        </li>
      </ul>
    </template>
  </ModalWithButton>
</template>

<style scoped lang="scss">
.open-modal {
  ul {
    list-style: none;
    padding: 0;
  }

  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 36px;
  }

  li + li {
    border-top: 1px solid var(--color-divider);
  }

  &__actions {
    display: flex;
    align-items: center;
    margin-left: 24px;
    flex-shrink: 0;
  }

  &__mfm-version {
    color: var(--color-text-muted);
    font-family: var(--font-display);
    font-size: 17px;
    margin-right: 8px;
    word-spacing: -8px;
    white-space: nowrap;

    &--outdated {
      cursor: help;
      font-weight: bold;
      color: var(--color-negative);
    }
  }

  &__mfm-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.8px;
  }

  &__edition {
    background-color: var(--color-divider);
    border-radius: 2px;
    color: var(--color-text);
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 600;
    margin-right: 8px;
    padding: 2px 6px;
    white-space: nowrap;
    letter-spacing: 0.5px;

    &--11th {
      background-color: var(--color-accent);
      color: #0f1923;
    }
  }

  &__edition-label {
    font-size: 10px;
    margin-right: 2px;
    opacity: 0.75;
  }

  &__delete,
  &__copy {
    background: transparent;
    border-radius: 2px;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    margin-inline-start: 16px;
    padding: 3px;

    svg {
      height: 24px;
      width: 24px;
      fill: currentColor;
    }

    &:hover {
      color: var(--color-text);
    }

    &[disabled] {
      opacity: 0.4;
    }
  }

  &__delete:not([disabled]):hover {
    background-color: var(--color-negative);
    color: var(--color-text);
  }

  &__warning {
    color: var(--color-accent);
    margin-inline: 8px;
    cursor: help;
    svg {
      height: 24px;
      width: 24px;
      fill: currentColor;
    }
  }

  form {
    flex-grow: 1;
    display: flex;
    min-width: 0;
  }

  &__button {
    background: transparent;
    border: none;
    color: var(--color-text);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 16px;
    padding: 0 8px;
    height: 36px;
    flex-grow: 1;
    text-align: start;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;

    &:hover {
      background-color: var(--color-header);
    }
  }

  &__list-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 1;
    min-width: 0;
  }

  &__list-details {
    flex-shrink: 0;
    white-space: nowrap;
  }
}
</style>
