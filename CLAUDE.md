# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Warhammer 40K 11th Edition army list builder hosted at https://furka.github.io/40k-11th-list-builder/. It's a Vue 3 application built with Vite that helps users build and manage army lists based on the official Munitorum Field Manual (MFM) points values.

## Development Commands

```bash
# Install dependencies (use ci for clean install from lock file)
npm ci

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Dev server lifecycle**: if you start a dev server (`npm run dev`, `npm run preview`, or any other long-running process) during a task, shut it down before ending the turn. Don't leave background servers running for the user to find later.

## Architecture

### Data Flow and State Management

State is split across Pinia stores in `src/stores/`. Each store persists its own slice to `localStorage` via `save` / `debouncedSave` helpers from `src/utils/localStorage.js` (key prefix `"11th:"`). There is no central `appData` object — `src/App.vue` wires the stores together and triggers `loadFromStorage()` + `autoUpgradeMFMVersion()` on mount.

The seven stores:

- **`armyList`** (`src/stores/armyList.js`) — The active list being edited: `name`, `faction`, `maxPoints`, `mfm_version`, `version`, `modifiedDate`, `sortOrder`, `units`, `detachments`, `allies`, `bonusBattleline`. Also exposes ~20 computeds (validation errors, points breakdown, unit counts, attachment trees, etc.). Persisted to `"currentList"`.
- **`app`** (`src/stores/app.js`) — UI prefs (`codexFilter`, `group`, `sortOrder`, `showLegends`, `showAvailableOnly`, `showPointsChanges`, `editCollection`) plus the saved-`lists` array. Window dimensions (`appHeight`, `appWidth`) live here but aren't persisted.
- **`collection`** (`src/stores/collection.js`) — User's owned-unit counts as a `{ unitName: count }` map. Persisted to `"collection"`.
- **`mfm`** (`src/stores/mfm.js`) — Wraps the aggregated MFM bundle (`MFM.CURRENT`, `MFM.PREVIOUS`), version lookup, and per-list upgrade helpers (`autoUpgradeMFMVersion`, `hasInvalidMFM`, `changes`).
- **`codex`** (`src/stores/codex.js`) — Right-panel filtering state: active faction, allies, current MFM, derived `compendium` and lookup maps.
- **`drag`** / **`detachmentDrag`** (`src/stores/drag.js`, `src/stores/detachmentDrag.js`) — Pointer-event drag-and-drop state for unit reordering and detachment reordering.

#### Current List Shape

`armyListStore.toObject()` returns a list with this shape (saved lists in `appStore.lists` use the same shape):

```javascript
{
  name: "My Army",
  faction: "THOUSAND SONS",        // uppercase faction name
  maxPoints: 2000,
  mfm_version: "V1.0",             // matches a key in MFM (e.g. "V1.0")
  version: "1.0.10",               // app version when list was created
  modifiedDate: 1718000000000,
  sortOrder: "manual",
  detachments: ["HEXWARP THRALLBAND"],
  allies: [],                      // array of allied faction names
  bonusBattleline: [],             // manually-promoted datasheet names
  units: [
    {
      id: "uuid-123",              // assigned at runtime, used for drag + attachment refs
      name: "Necron Warriors",
      optionName: "10 models",     // omitted if datasheet has a single size
      models: 10,
      points: 100,
      faction: "NECRONS",
      // Optional fields, present only when relevant:
      // attachedTo: "uuid-parent"      — wargear / leaders / enhancements bound to a parent unit
      // allied: true, alliedFaction: "ADEPTA SORORITAS"  — allied-detachment unit
      // detachment: "HEXWARP THRALLBAND" — for "Enhancements" sentinels, names the source detachment
      // parentDataSheet: "Necron Warriors" — wargear options keyed back to their host datasheet
    },
    {
      name: "Enhancements",        // sentinel; optionName carries the enhancement name
      optionName: "Dimensional Overseer",
      points: 25,
      attachedTo: "uuid-character",
      detachment: "HEXWARP THRALLBAND",
    }
  ]
}
```

Role booleans (`battleLine`, `character`, `epicHero`, …) are **not** copied onto units — look them up on the datasheet (see "Common Tasks" below). `src/stores/armyList.js` is the source of truth for the full field list and validation logic.

### MFM (Munitorum Field Manual) System

The MFM data is scraped from the official GW faction-pack PDFs, not copy-pasted text:

- **Source files**: `src/data/munitorum-field-manual-11th/v<siteVersion>-<scrapedAt>/` — sparse historical snapshots. Each dated subdirectory contains a `_manifest.json`, a `_changes.md` (human-readable diff vs the prior snapshot), and **only the faction JSONs whose payload changed** since the previous snapshot. The full faction set for any snapshot is reconstructed by walking all snapshots oldest→newest and layering each one's files on top of the running set (see `snapshot-resolve.mjs` for the Node helper, `index.js` for the Vite/browser equivalent).
- **Parser**: `src/utils/data-reader-11th.js` — `parse11thFaction()` and `parse11thSnapshot()` produce `{ FACTIONS, DATA_SHEETS, MFM_VERSION }` from the resolved snapshot.
- **Aggregator**: `src/data/munitorum-field-manual-11th/index.js` — `load11thMFM()` auto-globs every snapshot dir at build time, builds the overlay-resolved state for each, and produces `{ "V1.0": {...}, ..., CURRENT, PREVIOUS }`. Adding a new snapshot is zero-config.
- **Version manager**: `src/stores/mfm.js` (`useMfmStore`) — exposes `MFM.CURRENT` / `MFM.PREVIOUS`, version lookup, plus per-list upgrade helpers (`autoUpgradeMFMVersion`, `hasInvalidMFM`, `changes`). `App.vue` calls `autoUpgradeMFMVersion()` for the current list and every saved list on mount.

To add a new MFM version, re-run `node scripts/scrape-mfm-11th/index.mjs`. The scraper either updates files in place (content unchanged, no new dir) or mints a new sparse snapshot dir + `_changes.md`; the aggregator picks it up automatically. The pipeline also runs `llm-classify.mjs` (datasheet role classification) and `llm-classify-detachment-grants.mjs` (detachment-level BATTLELINE grants → `src/data/configs/conditional-battleline.auto.json`).

**Other snapshot consumers** (`scripts/audit-and-prune-overrides.mjs`, `scripts/scrape-bsdata-{enhancements,wargear}/index.mjs`, `scripts/scrape-mfm-11th/audit-restrictions.mjs`) all go through `snapshot-resolve.mjs`'s `resolveSnapshotState`/`resolveSnapshotStateSync` to get the overlay-resolved set — never read a snapshot dir directly with `readdir`, or unchanged factions in older sparse snapshots will silently disappear.

### Component Structure

- **App.vue**: Root component; wires the Pinia stores and triggers load/auto-upgrade on mount.
- **ArmyList.vue**: Left panel showing selected units; supports drag-to-reorder via the pointer-event drag stores; visually scales based on points.
- **ArmyCodex.vue**: Right panel showing available units filtered by faction/detachment with grouping and sorting; also applies the conditional-battleline overlay.
- **DataSheet.vue**: Individual unit card showing available sizes/options.
- **CodexOptions.vue**: Right-panel options menu (sort order, Legends toggle, available-only toggle, points-changes toggle).
- **BattlelineOverridesModal.vue**: Faction-wide datasheet picker for manually promoting units to BATTLELINE (writes to `armyListStore.bonusBattleline`).
- **PrintableArmyList.vue**: Print-only view (hidden on screen, shown via CSS `@media print`).

### List Sharing System

Lists can be shared via URL using a compressed query string format:
- **Serialization**: `src/utils/serialize-list.js` converts list objects to URL params (shortened keys: `n`, `f`, `m`, `v`, `mfm`, `d`, `un`, `up`, etc.)
- On app load, if URL params exist, the list is deserialized and added to saved lists
- Used by ShareListModal component to generate shareable links

### Configuration System

`src/data/configs/index.js` and `config.json` define hand-curated unit metadata by faction:
- `battle-line`: Units that count as Battle Line
- `epic-hero`: Epic Hero units (limited to 3 per army)
- `character`: Character units
- `dedicated-transport`: Transport units
- `fortification`: Fortification units
- `sub-factions`: Sub-faction mappings
- `conditional`: Special rules for unit availability

Two **auto-generated** companion files sit alongside `config.json` and must not be hand-edited (they're regenerated by the scraper):
- `conditional-battleline.auto.json` — per-faction rules `{ trigger: { type: "detachment", name }, battleLine: [datasheet, ...] }`. Consumed by `src/utils/conditional-battleline.js` (`conditionalBattlelineUnits`, `autoBattlelineSource`) to promote datasheets to BATTLELINE when a triggering detachment is active. Manual overrides are merged in from `armyListStore.bonusBattleline` (driven by `BattlelineOverridesModal.vue`).
- `enhancement-restrictions.auto.json` — scraped enhancement eligibility rules.

This metadata is merged into datasheets during parsing.

## Key Technical Details

- **Vue 3 Composition API**: All components use `<script setup>` syntax
- **Deep Freeze**: MFM data is frozen after parsing to prevent accidental mutations
- **UUID**: Each unit instance gets a unique ID for drag-and-drop tracking
- **Visual Scaling**: ArmyList component dynamically scales unit display based on points/max points ratio
- **Vite Config**: Base path set to `/40k-11th-list-builder/` for GitHub Pages deployment

## Code Style Guidelines

### Comments

**Write self-documenting code. Comments should explain WHY, not WHAT.**

Bad (redundant comments):
```javascript
if (unit.name === "Enhancements") return 0; // Enhancements first
if (dataSheet.character) return 1; // Characters
if (dataSheet.battleLine) return 2; // Battle Line
```

Good (self-documenting code):
```javascript
if (unit.name === "Enhancements") return 0;
if (dataSheet.character) return 1;
if (dataSheet.battleLine) return 2;
```

Good (explaining WHY):
```javascript
// Units don't have role properties copied from datasheets, so we look them up
const dataSheet = getDataSheet(unit.name);
if (!dataSheet) return 4;
```

Only add comments when:
- Explaining non-obvious business logic or workarounds
- Clarifying why a particular approach was chosen
- Warning about gotchas or edge cases

Never add comments that simply repeat what the code says.

## Common Tasks

When working with unit data or display logic, remember that units have:
- `name`: Datasheet name (e.g., "Intercessor Squad")
- `optionName`: Size/variant name (e.g., "5 models")
- `models`: Number of models in the unit
- `points`: Current point cost
- `bonus`: Boolean indicating if option can be taken multiple times

When making changes to unit filtering or grouping, the relevant logic is in `src/components/ArmyCodex.vue` — it handles faction filtering, the Legends and "available-only" toggles, role-based grouping, and applies the conditional-battleline overlay.
