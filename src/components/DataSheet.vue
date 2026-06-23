<script setup>
import { computed } from "vue";
import { v4 as uuidv4 } from "uuid";
import { SORT_EXPENSIVE_FIRST } from "../data/constants";
import { sortOptionsPtsDescending } from "../utils/sort-functions";
import { unitMax } from "../utils/unit-max";
import { useArmyListStore } from "../stores/armyList";
import { useAppStore } from "../stores/app";
import { useCodexStore } from "../stores/codex";
import { useCollectionStore } from "../stores/collection";
import {
  findAvailableWargearHost,
  wargearMaxPerUnit,
} from "../utils/wargear-limits";
import { legalDropSlots } from "../utils/legal-drop-slots";
import { hasKeyword } from "../utils/keywords";
import LeaderIcon from "../assets/leader-skull-icon.svg";
import SupportIcon from "../assets/support-icon.svg";

const armyListStore = useArmyListStore();
const appStore = useAppStore();
const codexStore = useCodexStore();
const collectionStore = useCollectionStore();

const props = defineProps({
  dataSheet: Object,
});

function addUnit(option) {
  if (!optionAvailable(option)) return;

  const newUnit = {
    id: uuidv4(),
    models: option.models,
    name: props.dataSheet.name,
    optionName: option.name,
  };
  if (props.dataSheet.allied) {
    newUnit.allied = true;
    // Pin the source faction so validation (and any later points lookup) can
    // tell whose codex this unit came from. Same-named datasheets in
    // different codexes can have different points costs, so the lookup must
    // not silently fall through to another faction's copy.
    newUnit.alliedFaction = props.dataSheet.alliedFaction;
  }
  armyListStore.addUnit(newUnit);

  // Support characters MUST be attached to a host or they fail validation —
  // auto-attach to the first legal host so a one-click add doesn't leave a
  // red row that the user has to drag-resolve. Mirrors the same auto-attach
  // behavior `addEnhancement` already implements for enhancements.
  if (props.dataSheet.support?.attachesTo?.length) {
    const slots = legalDropSlots(
      armyListStore.units,
      newUnit.id,
      codexStore.getDataSheet
    );
    const attachHostIds = new Set(
      slots.filter((s) => s.type === "attach").map((s) => s.hostId)
    );
    if (attachHostIds.size > 0) {
      const firstHost = armyListStore.units.find((u) =>
        attachHostIds.has(u.id)
      );
      if (firstHost) armyListStore.moveUnit(newUnit.id, firstHost.id, 0);
    }
  }
}

// Wargear is auto-attached to the first matching host (in army-list order)
// whose count of THIS option is below its per-host cap. The cap defaults to
// WARGEAR_DEFAULT_MAX_PER_UNIT (20) but is overridable per-option once we
// can source real numbers. When every matching host is saturated, the click
// is a no-op (the row is also visually disabled via `wargearAvailable`).
function addWargear(option) {
  const host = findAvailableWargearHost(
    armyListStore.units,
    props.dataSheet.name,
    option.name,
    wargearMaxPerUnit(option)
  );
  if (!host) return;
  armyListStore.addUnit({
    id: uuidv4(),
    name: "Wargear",
    parentDataSheet: props.dataSheet.name,
    optionName: option.name,
    attachedTo: host.id,
  });
}

function wargearAvailable(option) {
  return Boolean(
    findAvailableWargearHost(
      armyListStore.units,
      props.dataSheet.name,
      option.name,
      wargearMaxPerUnit(option)
    )
  );
}

function wargearTooltip(option) {
  if (wargearAvailable(option)) return `Add to your ${props.dataSheet.name}`;
  const hasAny = armyListStore.units.some(
    (u) => u.name === props.dataSheet.name
  );
  if (!hasAny) return `Add a ${props.dataSheet.name} first`;
  return `All your ${props.dataSheet.name}s are at the max for this option`;
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

// Collection-driven ownership. `getUnitCount` returns 999 (uncapped) when the
// user hasn't set a value for this datasheet, so by default nothing gets
// gated — the cap only kicks in once they've actively edited their collection.
const owned = computed(() => {
  if (props.dataSheet.enhancements) return 999;
  return collectionStore.getUnitCount(props.dataSheet.name);
});

const modelsTaken = computed(
  () => armyListStore.modelsTaken[props.dataSheet.name] || 0
);

function onCollectionBlur(event) {
  const value = Math.min(999, Math.max(0, Number(event.target.value) || 0));
  collectionStore.setUnitCount(props.dataSheet.name, value);
}

function enoughInCollection(option) {
  if (!option.models) return true;
  return option.models + modelsTaken.value <= owned.value;
}

const hasOwned = computed(() => {
  if (props.dataSheet.enhancements) return true;
  if (appStore.editCollection) return true;
  return owned.value > 0;
});

function enhancementTaken(enhancement) {
  return armyListStore.enhancementsTaken.has(enhancement.name);
}

function optionAvailable(option) {
  if (maxed.value) return false;
  if (props.dataSheet.enhancements) return !enhancementTaken(option);
  return enoughInCollection(option);
}

</script>

<template>
  <div
    class="data-sheet"
    v-if="options.length && hasOwned && (!appStore.showAvailableOnly || !maxed)"
  >
    <div class="data-sheet__title" :class="{ maxed: maxed }">
      <span class="data-sheet__name">
        <template v-if="max > -1">{{ count }}/{{ max }} </template>
        {{ props.dataSheet.displayName || props.dataSheet.name }}
      </span>
      <label
        v-if="!props.dataSheet.enhancements && appStore.editCollection"
        class="data-sheet__owned-label"
        title="How many of these do you own?"
        @click.stop
      >
        Owned:
        <input
          class="data-sheet__owned"
          type="number"
          min="0"
          max="999"
          :value="owned"
          @focus="$event.target.select()"
          @blur="onCollectionBlur"
        />
      </label>
      <div
        v-else-if="!props.dataSheet.enhancements && owned < 999"
        class="data-sheet__count"
        title="Models in this list / models you own"
      >
        {{ modelsTaken }} / {{ owned }}
      </div>
      <span class="data-sheet__pills">
        <span
          v-if="props.dataSheet.allied"
          class="data-sheet__pill data-sheet__pill--allied"
          :title="`Allied unit — ${props.dataSheet.alliedFaction}`"
          >ALLY</span
        >
        <span
          v-if="hasKeyword(props.dataSheet, 'EPIC HERO')"
          class="data-sheet__pill data-sheet__pill--accent"
          title="Epic Hero"
          >E</span
        >
        <span
          v-if="props.dataSheet.legends"
          class="data-sheet__pill"
          title="Legends"
          >Lg</span
        >
      </span>
    </div>
    <template v-for="(group, gi) in tierGroups" :key="gi">
      <div
        class="data-sheet__tier-label"
        :class="{ maxed: !group.tierEnabled }"
      >
        {{ group.heading }}
      </div>
      <ul>
        <li
          v-for="(row, ri) in group.rows"
          :key="ri"
          v-show="!appStore.showAvailableOnly || rowAvailable(row, group)"
          @click="rowAvailable(row, group) && addUnit(row.size)"
          :class="{ maxed: !rowAvailable(row, group) }"
        >
          <span class="data-sheet__option-label">
            <span v-if="row.size.models">
              {{ row.size.models }}
              {{ row.size.models === 1 ? "model" : "models" }}
            </span>
            <span v-if="row.size.name" class="data-sheet__option-name">
              {{ row.size.name }}
            </span>
          </span>
          <span class="data-sheet__option-spacer"></span>
          <span class="data-sheet__points">
            {{ row.points }} pts
          </span>
        </li>
      </ul>
    </template>
    <template v-if="props.dataSheet.wargearOptions?.length">
      <div class="data-sheet__tier-label">WARGEAR OPTIONS</div>
      <ul>
        <li
          v-for="(wo, wi) in props.dataSheet.wargearOptions"
          :key="`wgr-${wi}`"
          :class="{ maxed: !wargearAvailable(wo) }"
          :title="wargearTooltip(wo)"
          @click="wargearAvailable(wo) && addWargear(wo)"
        >
          <span class="data-sheet__option-label">
            <span class="data-sheet__option-name">per {{ wo.name }}</span>
          </span>
          <span class="data-sheet__option-spacer"></span>
          <span class="data-sheet__points">{{ wo.points }} pts</span>
        </li>
      </ul>
    </template>
    <div
      v-if="props.dataSheet.leader?.attachesTo?.length"
      class="data-sheet__role-row"
      :class="{ maxed: maxed }"
    >
      <div class="data-sheet__role-header">
        <span class="data-sheet__role-label">Leader</span>
        <LeaderIcon class="data-sheet__role-icon" />
      </div>
      <div class="data-sheet__role-attaches">
        {{ props.dataSheet.leader.attachesTo.join(", ") }}
      </div>
    </div>
    <div
      v-if="props.dataSheet.support?.attachesTo?.length"
      class="data-sheet__role-row"
      :class="{ maxed: maxed }"
    >
      <div class="data-sheet__role-header">
        <span class="data-sheet__role-label">Support</span>
        <SupportIcon class="data-sheet__role-icon" />
      </div>
      <div class="data-sheet__role-attaches">
        {{ props.dataSheet.support.attachesTo.join(", ") }}
      </div>
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

  &__pills {
    align-items: center;
    display: flex;
    flex-shrink: 0;
    gap: 3px;
  }

  &__owned-label {
    align-items: center;
    color: var(--color-text-muted);
    cursor: text;
    display: flex;
    flex-shrink: 0;
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 500;
    gap: 4px;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  &__owned {
    background-color: var(--color-bg);
    border: 1px solid var(--color-divider);
    border-radius: 2px;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 13px;
    padding: 2px 4px;
    text-align: right;
    width: 46px;

    &:focus {
      border-color: var(--color-accent);
      outline: none;
    }
  }

  &__count {
    color: var(--color-text-muted);
    flex-shrink: 0;
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.4px;
  }

  &__pill {
    background-color: var(--color-divider);
    border-radius: 2px;
    color: var(--color-text);
    cursor: help;
    font-family: var(--font-display);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.5px;
    line-height: 1;
    padding: 3px 6px;
    text-transform: uppercase;

    &--accent {
      background-color: var(--color-accent-dim);
      color: #0f1923;
    }

    &--allied {
      background-color: #5b3da6;
      color: #fff;
    }
  }

  &__tier-label {
    border-bottom: 1px solid var(--color-divider);
    color: var(--color-text-muted);
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 1.2px;
    margin: 10px 10px 0;
    padding-bottom: 5px;
    text-transform: uppercase;
  }

  &__option-label {
    align-items: baseline;
    color: var(--color-text);
    display: flex;
    flex-shrink: 0;
    font-family: var(--font-body);
    font-size: 13px;
    gap: 6px;
  }

  &__option-name {
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
    text-transform: uppercase;

    &--up {
      color: var(--color-negative);
    }
    &--down {
      color: var(--color-positive);
    }
  }

  &__role-row {
    border-top: 1px solid var(--color-divider);
    margin-top: 8px;
    padding: 6px 10px 8px;
  }

  &__role-header {
    align-items: center;
    color: var(--color-text-muted);
    display: flex;
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 600;
    justify-content: space-between;
    letter-spacing: 1.4px;
    text-transform: uppercase;
  }

  &__role-icon {
    color: var(--color-text-muted);
    fill: currentColor;
    flex-shrink: 0;
    height: 16px;
    width: 16px;
  }

  &__role-attaches {
    color: var(--color-text);
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.6px;
    margin-top: 4px;
    text-transform: uppercase;
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
</style>
