<script setup>
import { computed } from "vue";
import PACKAGE from "../../package.json";
import GithubIcon from "../assets/github-icon.svg";
import DiscordIcon from "../assets/discord-icon.svg";
import { useAppStore } from "../stores/app";
import { useArmyListStore } from "../stores/armyList";
import { useCodexStore } from "../stores/codex";
import { useMfmStore } from "../stores/mfm";
import MfmUpdateModal from "./MfmUpdateModal.vue";
import ToggleSwitch from "./ToggleSwitch.vue";

const appStore = useAppStore();
const armyListStore = useArmyListStore();
const codexStore = useCodexStore();
const mfmStore = useMfmStore();

// Mirrors DataSheet.vue's `displayedMFM`: the codex renders whichever MFM the
// list is pinned to, so the toggle is only meaningful when THAT version has a
// predecessor to diff against — not merely when the globally-latest one does.
const displayedMFM = computed(
  () => codexStore.currentMFM || mfmStore.MFM.CURRENT
);
const hasPreviousVersion = computed(
  () => !!mfmStore.getPreviousMFM(displayedMFM.value)
);
const pointsChangesLabel = computed(() =>
  appStore.showPointsChanges ? "Points Changes Visible" : "Points Changes Hidden"
);

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
      <!--
        Placed before the (conditional) update badge so the toggle keeps a
        stable position when the badge mounts and unmounts.
      -->
      <ToggleSwitch
        v-if="hasPreviousVersion"
        v-model="appStore.showPointsChanges"
        :label="pointsChangesLabel"
        tooltip="Show points changes compared to previous MFM version"
      />
      <MfmUpdateModal
        v-if="mfmStore.isListOutdated(armyListStore.toObject())"
        class="version-bar__update"
      />
    </div>
    <div class="version-bar__right">
      <span>app version {{ PACKAGE.version }}</span>
      <a
        class="version-bar__link"
        href="https://github.com/furka/40k-11th-list-builder"
        target="_blank"
        rel="noopener noreferrer"
        v-tooltip="'View source on GitHub'"
        aria-label="GitHub repository"
      >
        <GithubIcon class="version-bar__link-icon" />
      </a>
      <a
        class="version-bar__link"
        href="https://discord.gg/CtbC5kBeJ2"
        target="_blank"
        rel="noopener noreferrer"
        v-tooltip="'Join the Discord server'"
        aria-label="Discord server"
      >
        <DiscordIcon class="version-bar__link-icon" />
      </a>
    </div>
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

  // ToggleSwitch declares its own 15px; the bar runs at 12px. The parent's
  // nested selector out-specifies the child's scoped rule because a child
  // component's root element inherits this component's scope attribute.
  .toggle-switch {
    font-size: 12px;
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

  &__right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__link {
    display: inline-flex;
    align-items: center;
    color: var(--color-text-muted);
    text-decoration: none;

    &:hover {
      color: var(--color-accent);
    }
  }

  &__link-icon {
    height: 16px;
    width: 16px;
    fill: currentColor;
  }
}
</style>
