<script setup>
import { computed } from "vue";
import { v4 as uuidv4 } from "uuid";
import { GROUP_NONE, SORT_EXPENSIVE_FIRST } from "../data/constants";
import { sortOptionsPtsDescending } from "../utils/sort-functions";
import { isBattleLine } from "../utils/is-battleline";
import { isDedicatedTransport } from "../utils/is-dedicated-transport";
import { unitMax } from "../utils/unit-max";
import { useArmyListStore } from "../stores/armyList";
import { useAppStore } from "../stores/app";

const armyListStore = useArmyListStore();
const appStore = useAppStore();

const props = defineProps({
  dataSheet: Object,
});

function addUnit(option) {
  if (!optionAvailable(option)) return;

  const newUnit = {
    id: uuidv4(),
    bonus: option.bonus,
    models: option.models,
    name: props.dataSheet.name,
    optionName: option.name,
  };
  armyListStore.addUnit(newUnit);
}

const options = computed(() => {
  const sizes = [...props.dataSheet.sizes];
  if (appStore.sortOrder === SORT_EXPENSIVE_FIRST) {
    sizes.sort(sortOptionsPtsDescending);
  }
  return sizes;
});

// Pivot per-size tiers into per-tier groups so the codex can show every
// price point upfront (e.g. "YOUR 1ST TO 2ND UNITS COST" / "YOUR 3RD + UNIT
// COSTS") instead of squashing them onto one line. Tier groups that wouldn't
// apply to the next copy the user adds are flagged disabled — the running
// count picks the actual tier at engine time, so the codex's job is purely
// to make it impossible to misclick.
const tierGroups = computed(() => {
  const sizes = options.value;
  if (!sizes.length) return [];

  const tierKey = (t) => `${t.minCount}::${t.maxCount ?? "*"}`;
  const tierMap = new Map();

  for (const size of sizes) {
    const tiers = size.tiers ?? [
      { minCount: 1, points: size.basePoints ?? size.points },
    ];
    for (const tier of tiers) {
      const k = tierKey(tier);
      if (!tierMap.has(k)) {
        tierMap.set(k, {
          minCount: tier.minCount,
          maxCount: tier.maxCount,
          rows: [],
        });
      }
      tierMap.get(k).rows.push({ size, points: tier.points });
    }
  }

  const groups = [...tierMap.values()].sort(
    (a, b) => a.minCount - b.minCount
  );
  const nextCount = (count.value || 0) + 1;

  return groups.map((g) => ({
    ...g,
    heading: tierHeadingFor(g),
    tierEnabled:
      nextCount >= g.minCount &&
      (g.maxCount === undefined || nextCount <= g.maxCount),
  }));
});

function tierHeadingFor(g) {
  const min = g.minCount;
  const max = g.maxCount;
  if (min === 1 && max === undefined) return "YOUR UNIT COSTS";
  if (max === undefined) return `YOUR ${ord(min).toUpperCase()} + UNIT COSTS`;
  if (max === min) return `YOUR ${ord(min).toUpperCase()} UNIT COSTS`;
  return `YOUR ${ord(min).toUpperCase()} TO ${ord(max).toUpperCase()} UNITS COST`;
}

function ord(n) {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}

function rowAvailable(row, tierGroup) {
  return tierGroup.tierEnabled && optionAvailable(row.size);
}

const count = computed(
  () => armyListStore.unitCounts[props.dataSheet.name] || 0
);

const max = computed(() =>
  unitMax(props.dataSheet, armyListStore.toObject())
);

const maxed = computed(() => count.value >= max.value);

function enhancementTaken(enhancement) {
  return armyListStore.enhancementsTaken.has(enhancement.name);
}

function optionAvailable(option) {
  if (option.bonus) return true;
  if (maxed.value) return false;
  if (props.dataSheet.enhancements) return !enhancementTaken(option);
  return true;
}
</script>

<template>
  <div class="data-sheet" v-if="options.length">
    <div class="data-sheet__title" :class="{ maxed: maxed }">
      <span class="data-sheet__name">
        <template v-if="max > -1"> {{ count }}/{{ max }}</template>
        {{ props.dataSheet.displayName || props.dataSheet.name }}
        <template v-if="appStore.group === GROUP_NONE">
          <span v-if="isBattleLine(props.dataSheet)" title="Battleline">[B]</span>
          <span v-if="props.dataSheet.character" title="Character">[C]</span>
          <span
            v-if="isDedicatedTransport(props.dataSheet)"
            title="Dedicated Transport"
            >[T]</span
          >
        </template>
        <span v-if="props.dataSheet.epicHero" title="Epic Hero">[E]</span>
        <span v-if="props.dataSheet.legends" title="Legends">[Lg]</span>
        <span
          v-if="props.dataSheet.leader"
          class="data-sheet__role-leader"
          title="Leader"
          >[Leader]</span
        >
        <span
          v-if="props.dataSheet.support"
          class="data-sheet__role-support"
          title="Support"
          >[Sup]</span
        >
      </span>
    </div>
    <div
      v-if="props.dataSheet.leader?.attachesTo?.length"
      class="data-sheet__attaches-to"
      title="Leader can attach to"
    >
      Leader: {{ props.dataSheet.leader.attachesTo.join(", ") }}
    </div>
    <div
      v-if="props.dataSheet.support?.attachesTo?.length"
      class="data-sheet__attaches-to"
      title="Support can attach to"
    >
      Support: {{ props.dataSheet.support.attachesTo.join(", ") }}
    </div>
    <template v-for="(group, gi) in tierGroups" :key="gi">
      <div
        v-if="tierGroups.length > 1"
        class="data-sheet__tier-label"
        :class="{ maxed: !group.tierEnabled }"
      >
        {{ group.heading }}
      </div>
      <ul>
        <li
          v-for="(row, ri) in group.rows"
          :key="ri"
          @click="rowAvailable(row, group) && addUnit(row.size)"
          :class="{ maxed: !rowAvailable(row, group) }"
        >
          <span v-if="row.size.models">
            {{ row.size.models }}
            {{ row.size.models === 1 ? "model" : "models" }}
          </span>
          <span v-if="row.size.name" class="data-sheet__option-name">
            {{ row.size.name }}
          </span>
          <span class="data-sheet__option-spacer"></span>
          <span class="data-sheet__points">
            <template v-if="row.size.bonus">+</template>
            {{ row.points }} pts
          </span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped lang="scss">
.data-sheet {
  margin-bottom: 1px;
  width: 300px;
  writing-mode: horizontal-tb;

  &__title {
    align-items: center;
    align-items: flex-end;
    background-color: rgba(0, 0, 0, 0.65);
    color: #fff;
    display: flex;
    font-weight: bold;
    justify-content: space-between;
    padding: 2px 4px;
    position: relative;
  }

  &__name {
    line-height: 20px;
    text-transform: capitalize;

    > span {
      cursor: help;
    }
  }

  &__role-leader,
  &__role-support {
    font-size: 0.8em;
    margin-left: 2px;
    opacity: 0.85;
  }

  &__attaches-to {
    background-color: rgba(0, 0, 0, 0.4);
    color: #ddd;
    font-size: 11px;
    font-style: italic;
    padding: 2px 6px;
  }

  &__tier-label {
    background-color: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 0.5px;
    margin-top: 1px;
    padding: 2px 6px;
    text-transform: uppercase;
  }

  label {
    align-items: center;
    background-color: #000;
    border-bottom: 2px dashed currentColor;
    bottom: 0;
    display: flex;
    font-size: 12px;
    padding: 4px;
    position: absolute;
    right: 0;
    top: 0;
  }

  &__owned {
    background-color: transparent;
    border: none;
    color: currentcolor;
    font-family: var(--font-family);
    font-size: 12px;
    font-weight: bold;
    padding: 2px;
    text-align: left;
    width: 3em;
  }

  &__count {
    flex-shrink: 0;
  }

  &__option-name {
    text-transform: capitalize;
  }

  &__option-spacer {
    border-bottom: 2px dotted black;
    flex-grow: 1;
    margin: 4px 2px;
  }

  &__points {
    flex-shrink: 0;

    &--up {
      color: rgb(150, 0, 0);
    }
    &--down {
      color: rgb(0, 145, 77);
    }
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    border-radius: 3px;
    border: 2px solid transparent;
    cursor: pointer;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 2px;

    &:hover {
      border-color: black;
    }
  }

  .maxed {
    cursor: not-allowed;
    opacity: 0.25;

    li {
      cursor: not-allowed;

      &:hover {
        border-color: transparent;
      }
    }
  }
}
</style>
