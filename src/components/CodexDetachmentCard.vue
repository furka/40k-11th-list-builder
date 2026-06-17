<script setup>
import { computed } from "vue";
import { v4 as uuidv4 } from "uuid";
import { useArmyListStore } from "../stores/armyList";
import { useAppStore } from "../stores/app";

const armyListStore = useArmyListStore();
const appStore = useAppStore();

const props = defineProps({
  detachment: Object,
});

const selected = computed(() =>
  armyListStore.detachments.includes(props.detachment.name)
);

const cantAddReason = computed(() =>
  armyListStore.whyCantAddDetachment(props.detachment.name)
);
const disabled = computed(
  () => !selected.value && cantAddReason.value !== null
);

function onTitleClick() {
  if (disabled.value || selected.value) return;
  armyListStore.addDetachment(props.detachment.name);
}

function onEnhancementClick(enh) {
  if (disabled.value) return;
  if (!selected.value) {
    const ok = armyListStore.addDetachment(props.detachment.name);
    if (!ok) return;
  }
  armyListStore.addUnit({
    id: uuidv4(),
    name: "Enhancements",
    optionName: enh.name,
    // Tag the parent detachment so removeDetachment can cascade-delete this
    // enhancement when the parent leaves the list (drag-to-bin etc.).
    detachment: props.detachment.name,
  });
}
</script>

<template>
  <div
    v-if="!appStore.showAvailableOnly || !disabled"
    class="data-sheet detachment-sheet"
    :class="{ 'detachment-sheet--selected': selected }"
    :title="disabled ? cantAddReason : ''"
  >
    <div
      class="data-sheet__title detachment-sheet__title"
      :class="{ maxed: disabled }"
      @click="onTitleClick"
    >
      <span class="data-sheet__name">
        {{ detachment.name }}
      </span>
      <span class="detachment-sheet__badge">{{ detachment.dp }}DP</span>
    </div>
    <div
      v-if="detachment.role"
      class="detachment-sheet__role"
      :class="{ maxed: disabled }"
      :style="{ backgroundColor: detachment.role.color }"
    >
      {{ detachment.role.name }}
    </div>
    <div
      v-for="tag in detachment.tags"
      :key="tag"
      class="detachment-sheet__section-bar"
      :class="{ maxed: disabled }"
    >
      {{ tag }}
    </div>
    <div
      v-if="detachment.enhancements?.length"
      class="detachment-sheet__section-bar"
      :class="{ maxed: disabled }"
    >
      Enhancements
    </div>
    <ul v-if="detachment.enhancements?.length">
      <li
        v-for="enh in detachment.enhancements"
        :key="enh.name"
        :class="{ maxed: disabled }"
        @click="onEnhancementClick(enh)"
      >
        <span class="data-sheet__option-name">{{ enh.name }}</span>
        <span
          v-if="enh.isUnitUpgrade"
          class="detachment-sheet__upgrade-badge"
          title="Unit upgrade — attaches to a non-character unit"
        >UPGRADE</span>
        <span class="data-sheet__option-spacer"></span>
        <span class="data-sheet__points">{{ enh.points }} pts</span>
      </li>
    </ul>
    <div
      v-if="detachment.leader?.attachesTo?.length"
      class="detachment-sheet__leader"
      :class="{ maxed: disabled }"
    >
      <span class="detachment-sheet__leader-label">Leader:</span>
      {{ detachment.leader.attachesTo.join(", ") }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.data-sheet {
  background-color: var(--color-surface);
  margin-bottom: 1px;
  width: 300px;
  writing-mode: horizontal-tb;

  &__title {
    align-items: center;
    background-color: var(--color-header);
    color: var(--color-text);
    display: flex;
    font-family: var(--font-display);
    font-weight: 600;
    gap: 6px;
    justify-content: space-between;
    letter-spacing: 0.3px;
    padding: 6px 10px;
    position: relative;
    text-transform: uppercase;
  }

  &__name {
    flex-grow: 1;
    font-size: 16px;
    line-height: 20px;
    min-width: 0;
  }

  &__option-name {
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 13px;
    text-transform: capitalize;
  }

  &__option-spacer {
    border-bottom: 1px dotted var(--color-text-muted);
    flex-grow: 1;
    margin: 0 4px 4px;
    min-width: 12px;
  }

  &__points {
    color: var(--color-accent);
    flex-shrink: 0;
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 4px 10px;
  }

  li {
    align-items: baseline;
    border-radius: 2px;
    cursor: pointer;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 3px 4px;

    &:hover {
      background-color: rgba(255, 255, 255, 0.04);
    }
  }

  .maxed {
    cursor: not-allowed;
    opacity: 0.3;

    li {
      cursor: not-allowed;

      &:hover {
        background-color: transparent;
      }
    }
  }
}

.detachment-sheet {
  &--selected {
    box-shadow: inset 4px 0 0 var(--color-accent);
  }

  &__title {
    cursor: pointer;
  }

  &__badge {
    background-color: var(--color-accent-dim);
    border-radius: 2px;
    color: #0f1923;
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 600;
    padding: 2px 7px;
  }

  &__role {
    color: #fff;
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1.4px;
    padding: 4px 10px;
    text-transform: uppercase;
  }

  &__section-bar {
    background-color: #475569;
    color: #fff;
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1.4px;
    padding: 4px 10px;
    text-transform: uppercase;
  }

  &__leader {
    color: var(--color-text);
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.6px;
    padding: 6px 10px 8px;
    text-transform: uppercase;
  }

  &__leader-label {
    color: var(--color-text-muted);
    margin-right: 6px;
  }

  // Mirrors ArmyListUnit's __upgrade-badge so the same visual cue marks
  // unit-upgrade enhancements in both the codex panel and the list. Matches
  // Games Workshop's own visual language — bright green pill, full "UPGRADE"
  // word in uppercase white.
  &__upgrade-badge {
    align-items: center;
    background-color: var(--color-positive);
    border-radius: 3px;
    color: #fff;
    cursor: help;
    display: inline-flex;
    flex-shrink: 0;
    font-family: var(--font-display);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.8px;
    margin: 0 6px;
    padding: 1px 6px;
    text-transform: uppercase;
  }
}
</style>
