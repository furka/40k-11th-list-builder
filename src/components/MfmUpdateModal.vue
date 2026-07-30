<script setup>
import { computed, ref } from "vue";
import ModalWithButton from "./ModalWithButton.vue";
import RiskIcon from "../assets/risk-icon.svg";
import { useArmyListStore } from "../stores/armyList";
import { useMfmStore } from "../stores/mfm";
import { computeListPoints } from "../utils/list-points";

const armyListStore = useArmyListStore();
const mfmStore = useMfmStore();

const modal = ref(null);

const list = computed(() => armyListStore.toObject());
const currentVersion = computed(() => mfmStore.MFM.CURRENT?.MFM_VERSION);
const listVersion = computed(() => list.value.mfm_version || "unknown");
const hasInvalid = computed(() => mfmStore.hasInvalidMFM(list.value));
const changes = computed(() => mfmStore.changes(list.value));

const oldTotal = computed(() => {
  const listMFM = mfmStore.getVersion(list.value.mfm_version) || mfmStore.MFM.CURRENT;
  return computeListPoints(list.value, listMFM, list.value.faction).total;
});
const newTotal = computed(
  () => computeListPoints(list.value, mfmStore.MFM.CURRENT, list.value.faction).total
);

function changeLabel(change) {
  return change.optionName || (change.models ? `${change.models} models` : "");
}

function applyUpdate() {
  armyListStore.mfm_version = currentVersion.value;
  modal.value?.close();
}
</script>

<template>
  <ModalWithButton
    ref="modal"
    class="mfm-update"
    title="This list has points changes compared to the latest MFM version"
  >
    <template v-slot:button>
      <RiskIcon class="mfm-update__trigger-icon" />
      <span>New Version Available</span>
    </template>
    <template v-slot:content>
      <div class="mfm-update__content">
        <h2 class="mfm-update__title">
          MFM {{ listVersion.toLowerCase() }} →
          {{ currentVersion?.toLowerCase() }}
        </h2>

        <p class="mfm-update__total">
          List total
          <span class="mfm-update__total-old">{{ oldTotal }}</span>
          →
          <span
            class="mfm-update__total-new"
            :class="{
              'mfm-update__delta--up': newTotal > oldTotal,
              'mfm-update__delta--down': newTotal < oldTotal,
            }"
            >{{ newTotal }}</span
          >
          pts
        </p>

        <p v-if="hasInvalid" class="mfm-update__note">
          This list's MFM version is unknown. Updating will re-price it against
          the latest manual.
        </p>

        <ul v-else-if="changes.length" class="mfm-update__list">
          <li v-for="(c, i) in changes" :key="i" class="mfm-update__row">
            <span class="mfm-update__name">
              {{ c.name }}
              <span v-if="changeLabel(c)" class="mfm-update__option">
                {{ changeLabel(c) }}
              </span>
            </span>
            <span class="mfm-update__prices">
              <span class="mfm-update__old">{{ c.old }}</span>
              →
              <span class="mfm-update__new">{{ c.new }}</span>
              <span
                class="mfm-update__delta"
                :class="{
                  'mfm-update__delta--up': c.difference > 0,
                  'mfm-update__delta--down': c.difference < 0,
                }"
              >
                {{ c.difference > 0 ? "▲+" : "▼−" }}{{ Math.abs(c.difference) }}
              </span>
            </span>
          </li>
        </ul>

        <button class="mfm-update__button" @click="applyUpdate">
          Update to {{ currentVersion?.toLowerCase() }}
        </button>
      </div>
    </template>
  </ModalWithButton>
</template>

<style scoped lang="scss">
// Strip the generic boxed modal-button chrome so the trigger reads as the
// plain inline accent warning it replaces — the 22px version bar has no room
// for a bordered, filled button.
.mfm-update {
  align-items: center;
  display: inline-flex;

  :deep(.modal-button) {
    background: transparent;
    border: none;
    border-radius: 0;
    color: var(--color-accent);
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    gap: 4px;
    height: auto;
    letter-spacing: normal;
    padding: 0;
    text-transform: none;

    &:hover {
      background: transparent;
      opacity: 0.8;
    }
  }

  &__trigger-icon {
    height: 14px;
    width: 14px;
    flex-shrink: 0;
    fill: currentColor;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: min(420px, 80vw);
    padding-block-start: 32px;
  }

  &__title {
    font-family: var(--font-display);
    font-size: 22px;
    margin: 0;
  }

  &__total {
    color: var(--color-text-muted);
    margin: 0;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
    margin: 0;
    max-height: 50vh;
    overflow-y: auto;
    padding: 0;
  }

  &__row {
    align-items: baseline;
    border-top: 1px solid var(--color-divider);
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding: 6px 0;
  }

  &__option {
    color: var(--color-text-muted);
    font-size: 13px;
  }

  &__prices {
    color: var(--color-text-muted);
    flex-shrink: 0;
    font-family: var(--font-display);
    white-space: nowrap;
  }

  &__new {
    color: var(--color-text);
  }

  &__delta {
    font-size: 13px;
    margin-left: 6px;
  }

  &__delta--up {
    color: var(--color-negative);
  }
  &__delta--down {
    color: var(--color-positive);
  }

  &__button {
    align-self: flex-start;
    background-color: var(--color-accent);
    border: none;
    border-radius: 2px;
    color: #0f1923;
    cursor: pointer;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 1px;
    margin-block-start: 8px;
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
