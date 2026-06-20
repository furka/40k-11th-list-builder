<script setup>
import { computed } from "vue";
import PACKAGE from "../../package.json";
import RiskIcon from "../assets/risk-icon.svg";
import { useArmyListStore } from "../stores/armyList";
import { useMfmStore } from "../stores/mfm";

const armyListStore = useArmyListStore();
const mfmStore = useMfmStore();

const availableMFMVersions = computed(() => {
  const versions = Object.keys(mfmStore.MFM)
    .filter((key) => key !== "CURRENT" && key !== "PREVIOUS")
    .sort()
    .reverse();

  const currentVersion = armyListStore.mfm_version;
  if (!currentVersion) {
    versions.push("unknown");
  } else if (!versions.includes(currentVersion)) {
    versions.push(currentVersion);
  }
  return versions;
});
</script>

<template>
  <div class="version-bar">
    <div class="version-bar__mfm">
      <label>
        Munitorum Field Manual
        <select
          :value="armyListStore.mfm_version"
          @change="armyListStore.mfm_version = $event.target.value === 'unknown' ? undefined : $event.target.value"
        >
          <option
            v-for="version in availableMFMVersions"
            :key="version"
            :value="version === 'unknown' ? undefined : version"
          >
            {{ version === "unknown" ? version : version.toLowerCase() }}
          </option>
        </select>
      </label>
      <span
        v-if="mfmStore.isListOutdated(armyListStore.toObject())"
        class="version-bar__warning"
        title="This list has point changes compared to the latest MFM version. Change the MFM version to the left to update."
      >
        <RiskIcon class="version-bar__warning-icon" />
        <span>New Version Available</span>
      </span>
    </div>
    <span>app version {{ PACKAGE.version }}</span>
  </div>
</template>

<style scoped lang="scss">
.version-bar {
  height: var(--version-bar-height);
  background-color: var(--color-header);
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 8px;
  border-top: 1px solid var(--color-divider);
  box-sizing: border-box;

  &__mfm {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  span {
    white-space: nowrap;
  }

  label {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  select {
    background-color: var(--color-surface);
    border: 1px solid var(--color-divider);
    border-radius: 2px;
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 12px;
    padding: 0 4px;
    cursor: pointer;

    option {
      background-color: var(--color-surface);
      color: var(--color-text);
    }

    &:hover {
      border-color: var(--color-accent);
    }
  }

  &__warning {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--color-accent);
    font-weight: 600;
    cursor: help;

    &-icon {
      height: 16px;
      width: 16px;
      flex-shrink: 0;
    }
  }
}
</style>
