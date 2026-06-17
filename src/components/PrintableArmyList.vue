<script setup>
import { computed } from "vue";
import { useArmyListStore } from "../stores/armyList";

const armyListStore = useArmyListStore();

const PADSIZE = 10;

function getUnitPoints(unit) {
  const entry = armyListStore.pointsBreakdown.perUnit[unit.id];
  const p = entry?.points ?? 0;
  return p > 0 ? p : 0;
}

const validUnits = computed(() =>
  armyListStore.units.filter((unit) => getUnitPoints(unit) > 0)
);

const points = computed(() => armyListStore.pointsBreakdown.total);
const dp = computed(() => armyListStore.pointsBreakdown.dp);
const detachmentSummary = computed(() =>
  (dp.value?.byDetachment ?? [])
    .map((d) => `${d.name} (${d.dp}DP)`)
    .join(", ")
);

const maxUnitNameLength = computed(() => {
  const length = validUnits.value.reduce(
    (acc, curr) => Math.max(acc, formatUnit(curr).length),
    0
  );
  return length + PADSIZE + 3;
});

function formatUnit(unit) {
  let name = unit.name;
  if (unit.optionName) {
    name += ` — ${unit.optionName}`;
  }

  if (unit.models) {
    name += ` (${unit.models})`;
  }

  return name;
}

function unitLine(unit) {
  const unitPoints = getUnitPoints(unit);
  return (
    formatUnit(unit).padEnd(
      maxUnitNameLength.value - String(unitPoints).length,
      "."
    ) + `${unitPoints} pts`
  );
}
</script>

<template>
  <article class="army-list">
    <h1 v-if="armyListStore.name">
      {{ armyListStore.name }}
    </h1>
    <h2>
      <span class="army-list__name">{{ armyListStore.faction }}</span>
      — {{ armyListStore.mfm_version }}
      — {{ points }} pts
      <span v-if="dp">— {{ dp.used }}/{{ dp.max }} DP</span>
    </h2>
    <p v-if="detachmentSummary" class="army-list__detachments">
      Detachments: {{ detachmentSummary }}
    </p>

    <ul>
      <li v-for="(unit, index) in validUnits">
        {{ unitLine(unit) }}
      </li>
    </ul>
  </article>
</template>

<style scoped lang="scss">
.army-list {
  h1 {
    word-break: break-word;
  }

  &__name {
    text-transform: capitalize;
  }

  &__detachments {
    font-style: italic;
    margin: 0 0 8px;
  }

  ul {
    list-style: none;
    padding: 0;
  }
}
</style>
