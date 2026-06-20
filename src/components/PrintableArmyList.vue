<script setup>
import { computed, ref } from "vue";
import { useArmyListStore } from "../stores/armyList";
import { buildTree } from "../utils/attachment-tree";
import { useMonospaceColumns } from "../composables/useMonospaceColumns";

const armyListStore = useArmyListStore();

const PADSIZE = 10;
const MAX_LINE_WIDTH = 100;
const INDENT = "   ";
const BRANCH = "└─ ";

const ulEl = ref(null);
const availableCols = useMonospaceColumns(ulEl);

function getUnitPoints(unit) {
  const entry = armyListStore.pointsBreakdown.perUnit[unit.id];
  const p = entry?.points ?? 0;
  return p > 0 ? p : 0;
}

const validUnits = computed(() =>
  armyListStore.units.filter((unit) => getUnitPoints(unit) > 0)
);

// Tree built from valid units only — attached units whose host is
// price-zero (filtered out above) orphan up to the root level so they don't
// disappear from the print view alongside their host.
const tree = computed(() => buildTree(validUnits.value));

// Flatten tree to depth-annotated rows for rendering.
function flattenTree(nodes, depth = 0, acc = []) {
  for (const node of nodes) {
    acc.push({ unit: node.unit, depth });
    if (node.children.length) flattenTree(node.children, depth + 1, acc);
  }
  return acc;
}

const rows = computed(() => flattenTree(tree.value));

const points = computed(() => armyListStore.pointsBreakdown.total);
const dp = computed(() => armyListStore.pointsBreakdown.dp);
const detachmentRows = computed(() => dp.value?.byDetachment ?? []);

const titleLeft = computed(() => armyListStore.faction ?? "");
const titleRight = computed(() => `${points.value} pts`);
const titleLine = computed(() => dotLine(titleLeft.value, titleRight.value));

const alliesLine = computed(() => {
  // Only list allies that are actually contributing units to the army.
  // A picked-but-empty ally bloats the printable header without telling
  // the reader anything useful — and an ally with no units left after
  // editing should drop off the line automatically.
  const present = new Set();
  for (const u of armyListStore.units) {
    if (u.allied && u.alliedFaction) present.add(u.alliedFaction);
  }
  const list = (armyListStore.allies ?? []).filter((f) => present.has(f));
  return list.length ? `ALLIES: ${list.join(", ")}` : "";
});

function formatUnit(unit) {
  if (unit.name === "Enhancements") {
    return `[Enh] ${unit.optionName}`;
  }
  if (unit.name === "Wargear") {
    return `[Wgr] ${unit.optionName}`;
  }

  let name = unit.name;
  if (unit.optionName) {
    name += ` — ${unit.optionName}`;
  }

  if (unit.models) {
    name += ` (${unit.models})`;
  }

  return name;
}

function rowPrefix(depth) {
  return depth > 0 ? INDENT.repeat(depth - 1) + BRANCH : "";
}

function unitLeft(row) {
  return rowPrefix(row.depth) + formatUnit(row.unit);
}
function unitRight(row) {
  return `${getUnitPoints(row.unit)} pts`;
}
function detachmentLeft(d) {
  return d.role?.name ? `${d.name} (${d.role.name})` : d.name;
}
function detachmentRight(d) {
  return `${d.dp}DP`;
}

// Width that all dotted lines (title, detachments, units) share so right
// edges stay aligned across the whole printable block. Grows to fill the
// rendered <ul> width up to MAX_LINE_WIDTH; falls back to content + PADSIZE
// before the ResizeObserver has measured (e.g. first frame before open).
const lineWidth = computed(() => {
  let minContent = titleLeft.value.length + titleRight.value.length;
  for (const row of rows.value) {
    minContent = Math.max(
      minContent,
      unitLeft(row).length + unitRight(row).length
    );
  }
  for (const d of detachmentRows.value) {
    minContent = Math.max(
      minContent,
      detachmentLeft(d).length + detachmentRight(d).length
    );
  }
  const target =
    availableCols.value > 0
      ? Math.min(availableCols.value, MAX_LINE_WIDTH)
      : minContent + PADSIZE;
  return Math.max(minContent + 1, target);
});

function dotLine(left, right) {
  return left.padEnd(lineWidth.value - right.length, ".") + right;
}

function unitLine(row) {
  return dotLine(unitLeft(row), unitRight(row));
}

function detachmentLine(d) {
  return dotLine(detachmentLeft(d), detachmentRight(d));
}

const plainText = computed(() => {
  const lines = [];
  if (armyListStore.name) lines.push(armyListStore.name);
  lines.push(titleLine.value);
  lines.push("");
  if (alliesLine.value) lines.push(alliesLine.value);
  if (detachmentRows.value.length) {
    for (const d of detachmentRows.value) lines.push(detachmentLine(d));
    lines.push("");
  }
  for (const row of rows.value) lines.push(unitLine(row));
  return lines.join("\n");
});

defineExpose({ plainText });
</script>

<template>
  <article class="army-list">
    <ul ref="ulEl">
      <li v-if="armyListStore.name">{{ armyListStore.name }}</li>
      <li>{{ titleLine }}</li>
      <li>&nbsp;</li>
      <li v-if="alliesLine">{{ alliesLine }}</li>
      <template v-if="detachmentRows.length">
        <li v-for="(d, i) in detachmentRows" :key="`d-${i}`">
          {{ detachmentLine(d) }}
        </li>
        <li>&nbsp;</li>
      </template>
      <li v-for="(row, index) in rows" :key="row.unit.id ?? index">
        {{ unitLine(row) }}
      </li>
    </ul>
  </article>
</template>

<style scoped lang="scss">
.army-list {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  ul {
    list-style: none;
    padding: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}
</style>
